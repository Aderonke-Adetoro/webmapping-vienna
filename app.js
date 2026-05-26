/* app.js — MapLens: CVD simulation for Vienna U-Bahn */

/* --- Navigation --- */
function initNavToggle() {
    const toggle = document.querySelector('.nav__toggle');
    const links = document.querySelector('.nav__links');

    if (!toggle || !links) return;

    toggle.addEventListener('click', () => {
        links.classList.toggle('open');
    });
}


/* --- CVD Simulation Engine (Machado et al. 2009) --- */
const CVD_MATRICES = {
    protanopia: [
        // L-cone (long wavelength / red) absent
        // Causes red-green confusion, with reds appearing darker
        [0.152286, 1.052583, -0.204868],
        [0.114503, 0.786281,  0.099216],
        [-0.003882, -0.048116, 1.051998]
    ],
    deuteranopia: [
        // M-cone (medium wavelength / green) absent
        // Most common CVD type, causes red-green confusion
        [0.367322, 0.860646, -0.227968],
        [0.280085, 0.672501,  0.047413],
        [-0.011820, 0.042940, 0.968881]
    ],
    tritanopia: [
        // S-cone (short wavelength / blue) absent
        // Rare, causes blue-yellow confusion
        [1.255528, -0.076749, -0.178779],
        [-0.078411, 0.930809,  0.147602],
        [0.004733, 0.691367,  0.303900]
    ]
};

const IDENTITY_MATRIX = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1]
];

function interpolateMatrix(cvdMatrix, severity) {
    const t = Math.max(0, Math.min(1, severity));

    return IDENTITY_MATRIX.map((row, i) =>
        row.map((val, j) =>
            val * (1 - t) + cvdMatrix[i][j] * t
        )
    );
}

function matrixToSVGValues(matrix) {
    return [
        matrix[0][0], matrix[0][1], matrix[0][2], 0, 0,  // Red channel
        matrix[1][0], matrix[1][1], matrix[1][2], 0, 0,  // Green channel
        matrix[2][0], matrix[2][1], matrix[2][2], 0, 0,  // Blue channel
        0,            0,            0,            1, 0   // Alpha (unchanged)
    ].join(' ');
}

function updateSVGFilter(cvdType, severity) {
    const feMatrix = document.getElementById('cvd-matrix');
    if (!feMatrix) return;

    if (cvdType === 'normal' || severity === 0) {
        feMatrix.setAttribute('values', matrixToSVGValues(IDENTITY_MATRIX));
    } else {
        const fullMatrix = CVD_MATRICES[cvdType];
        const interpolated = interpolateMatrix(fullMatrix, severity);
        feMatrix.setAttribute('values', matrixToSVGValues(interpolated));
    }
}

function applyFilterToMap(cvdType) {
    const mapContainer = document.getElementById('map');
    if (!mapContainer) return;

    if (cvdType === 'normal') {
        mapContainer.style.filter = 'none';
    } else {
        mapContainer.style.filter = 'url(#cvd-filter)';
    }
}

function hexToRgb(hex) {
    hex = hex.replace('#', '');

    // Expand shorthand '#RGB' to '#RRGGBB'
    if (hex.length === 3) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }

    return [
        parseInt(hex.substring(0, 2), 16),
        parseInt(hex.substring(2, 4), 16),
        parseInt(hex.substring(4, 6), 16)
    ];
}

/**
 * Convert [R, G, B] (0–255) to a hex color string.
 * 
 * @param {number[]} rgb - [R, G, B] array with values 0–255
 * @returns {string} Color in '#RRGGBB' format
 */
function rgbToHex(rgb) {
    return '#' + rgb.map(v => {
        const clamped = Math.max(0, Math.min(255, Math.round(v)));
        return clamped.toString(16).padStart(2, '0');
    }).join('');
}

/**
 * Simulate how a specific color appears under a given CVD type
 * by applying the Machado matrix transformation.
 * 
 * @param {number[]} rgb - [R, G, B] array (0–255)
 * @param {number[][]} matrix - 3×3 CVD transformation matrix
 * @returns {number[]} Simulated [R, G, B] array (0–255)
 */
function simulateColor(rgb, matrix) {
    // Normalize to 0–1, multiply, scale back to 0–255
    const r = rgb[0] / 255;
    const g = rgb[1] / 255;
    const b = rgb[2] / 255;

    return [
        Math.round((matrix[0][0] * r + matrix[0][1] * g + matrix[0][2] * b) * 255),
        Math.round((matrix[1][0] * r + matrix[1][1] * g + matrix[1][2] * b) * 255),
        Math.round((matrix[2][0] * r + matrix[2][1] * g + matrix[2][2] * b) * 255)
    ];
}


/* ============================================================
   SECTION 3: MAP CONTROLLER
   
   Only runs when a #map element exists (i.e. on map.html).
   Handles MapLibre init, GeoJSON loading, CVD controls,
   legend, contrast table, popups, and panel toggle.
   ============================================================ */

/**
 * Official Wiener Linien U-Bahn line colors.
 * LINFO values from the GeoJSON map to line numbers.
 */
const UBAHN_LINES = {
    1: { name: 'U1', color: '#E8383a', label: 'Oberlaa – Leopoldau' },
    2: { name: 'U2', color: '#733e91', label: 'Schottentor – Seestadt' },
    3: { name: 'U3', color: '#f49719', label: 'Ottakring – Simmering' },
    4: { name: 'U4', color: '#49ad32', label: 'Hütteldorf – Heiligenstadt' },
    6: { name: 'U6', color: '#9f3939', label: 'Siebenhirten – Floridsdorf' }
};

/**
 * Descriptions of each CVD type, shown in the info box
 * when a user selects a simulation type.
 */
const CVD_DESCRIPTIONS = {
    protanopia: {
        title: 'Protanopia',
        cone: 'L-cone (long wavelength)',
        effect: 'Absence of L-cones causes insensitivity to red light. Reds appear much darker and can be confused with dark greens, browns, and blacks. Affects approximately 1% of males.',
        confusion: 'Red ↔ Green, Red ↔ Brown'
    },
    deuteranopia: {
        title: 'Deuteranopia',
        cone: 'M-cone (medium wavelength)',
        effect: 'Difficulty telling red and green colours apart. Reds may appear brighter due to missing M-cones. Most common type of colour blindness. Affects ~1.2% of men.',
        confusion: 'Red ↔ Green, Green ↔ Brown'
    },
    tritanopia: {
        title: 'Tritanopia',
        cone: 'S-cone (short wavelength)',
        effect: 'Absence of S-cones causes insensitivity to blue light. Blues can be confused with greens, and yellows with violets. This is the rarest form, affecting less than 0.01% of the population.',
        confusion: 'Blue ↔ Green, Yellow ↔ Violet'
    }
};

/** Vienna city center coordinates (roughly Stephansplatz). */
const VIENNA_CENTER = [16.373, 48.208];
const INITIAL_ZOOM = 12;

/** Current simulation state — shared across control functions. */
let currentCVDType = 'normal';
let currentSeverity = 1.0;

/**
 * Initialize the map page: MapLibre instance, GeoJSON layers,
 * all interactive controls. Only called when #map exists.
 */
function initMapPage() {
    /* ---------- MapLibre Setup ---------- */

    const VIENNA_BOUNDS = [
        [16.182, 48.118], // SW corner
        [16.577, 48.323]  // NE corner
    ];

    const map = new maplibregl.Map({
        container: 'map',
        style: 'vienna_transport_basemap.json',
        center: VIENNA_CENTER,
        zoom: INITIAL_ZOOM,
        minZoom: 10,
        maxZoom: 17,
        maxBounds: VIENNA_BOUNDS,
        attributionControl: false
    });

    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');


    /* ---------- Load GeoJSON & Add Layers ---------- */

    map.on('load', function () {
        fetch('ubahn-line.json')
            .then(response => response.json())
            .then(geojson => {
                // DATA NOTE: 1 feature has LINFO=null (Lina-Loos-Platz,
                // planned U2 Nord station). Filtered out via layer filters
                // below — only features matching known LINFO values render.

                map.addSource('ubahn', {
                    type: 'geojson',
                    data: geojson
                });

                // Route line layers (one per U-Bahn line)
                Object.entries(UBAHN_LINES).forEach(([linfo, line]) => {
                    // White outline for visual depth
                    map.addLayer({
                        id: `ubahn-outline-${line.name}`,
                        type: 'line',
                        source: 'ubahn',
                        filter: [
                            'all',
                            ['==', '$type', 'LineString'],
                            ['==', 'LINFO', parseInt(linfo)]
                        ],
                        layout: {
                            'line-join': 'round',
                            'line-cap': 'round'
                        },
                        paint: {
                            'line-color': '#ffffff',
                            'line-width': [
                                'interpolate', ['linear'], ['zoom'],
                                10, 4,
                                15, 8
                            ],
                            'line-opacity': 0.6
                        }
                    });

                    // Colored line
                    map.addLayer({
                        id: `ubahn-line-${line.name}`,
                        type: 'line',
                        source: 'ubahn',
                        filter: [
                            'all',
                            ['==', '$type', 'LineString'],
                            ['==', 'LINFO', parseInt(linfo)]
                        ],
                        layout: {
                            'line-join': 'round',
                            'line-cap': 'round'
                        },
                        paint: {
                            'line-color': line.color,
                            'line-width': [
                                'interpolate', ['linear'], ['zoom'],
                                10, 2.5,
                                15, 8
                            ]
                        }
                    });
                });

                // Station circle layers
                Object.entries(UBAHN_LINES).forEach(([linfo, line]) => {
                    map.addLayer({
                        id: `ubahn-station-${line.name}`,
                        type: 'circle',
                        source: 'ubahn',
                        filter: [
                            'all',
                            ['==', '$type', 'Point'],
                            ['==', 'LINFO', parseInt(linfo)],
                            ['has', 'HTXT']
                        ],
                        paint: {
                            'circle-radius': [
                                'interpolate', ['linear'], ['zoom'],
                                10, 2,
                                14, 5,
                                16, 7
                            ],
                            'circle-color': '#ffffff',
                            'circle-stroke-color': '#131313',
                            'circle-stroke-width': [
                                'interpolate', ['linear'], ['zoom'],
                                10, 1,
                                14, 3
                            ]
                        }
                    });
                });

                // Station name labels (visible at higher zoom)
                map.addLayer({
                    id: 'ubahn-station-labels',
                    type: 'symbol',
                    source: 'ubahn',
                    filter: [
                        'all',
                        ['==', '$type', 'Point'],
                        ['has', 'HTXT']
                    ],
                    minzoom: 13,
                    layout: {
                        'text-field': ['get', 'HTXT'],
                        'text-font': ['Open Sans Regular'],
                        'text-size': [
                            'interpolate', ['linear'], ['zoom'],
                            13, 9,
                            16, 12
                        ],
                        'text-offset': [0, 1.4],
                        'text-anchor': 'top',
                        'text-max-width': 8
                    },
                    paint: {
                        'text-color': '#333333',
                        'text-halo-color': '#ffffff',
                        'text-halo-width': 1.5
                    }
                });

                // Set up station click popups
                setupStationPopups(map);

                // Init legend swatches once layers are loaded
                updateLegend(currentCVDType, currentSeverity);
            })
            .catch(error => {
                console.error('Failed to load U-Bahn GeoJSON:', error);
            });
    });


    /* ---------- Station Popups ---------- */

    /**
     * Set up click handlers for station markers.
     * Shows a popup with station name, line, and opening year.
     * 
     * @param {maplibregl.Map} mapInstance - The MapLibre map
     */
    function setupStationPopups(mapInstance) {
        const stationLayers = Object.values(UBAHN_LINES).map(
            line => `ubahn-station-${line.name}`
        );

        stationLayers.forEach(layerId => {
            // Pointer cursor on hover
            mapInstance.on('mouseenter', layerId, () => {
                mapInstance.getCanvas().style.cursor = 'pointer';
            });
            mapInstance.on('mouseleave', layerId, () => {
                mapInstance.getCanvas().style.cursor = '';
            });

            // Popup on click
            mapInstance.on('click', layerId, (e) => {
                const props = e.features[0].properties;
                const lineInfo = UBAHN_LINES[props.LINFO];

                const content = `
                    <div style="font-family: 'DM Sans', sans-serif; padding: 4px;">
                        <strong style="font-size: 0.95rem;">${props.HTXT}</strong>
                        <div style="font-size: 0.82rem; color: #666; margin-top: 4px;">
                            <span style="
                                display: inline-block;
                                width: 10px; height: 10px;
                                border-radius: 2px;
                                background: ${lineInfo ? lineInfo.color : '#999'};
                                margin-right: 4px;
                                vertical-align: middle;
                            "></span>
                            ${lineInfo ? lineInfo.name : 'U-Bahn'}
                            ${props.EROEFFNUNG_JAHR ? ` · Opened ${props.EROEFFNUNG_JAHR}` : ''}
                        </div>
                    </div>
                `;

                new maplibregl.Popup({ offset: 10, closeButton: false })
                    .setLngLat(e.lngLat)
                    .setHTML(content)
                    .addTo(mapInstance);
            });
        });
    }


    /* ---------- CVD Toggle Controls ---------- */

    function initCVDToggles() {
        const toggleButtons = document.querySelectorAll('.seg-tab');
        const tabsContainer = document.querySelector('.seg-tabs');

        function slideToTab(activeBtn) {
            if (!tabsContainer || !activeBtn) return;
            const containerRect = tabsContainer.getBoundingClientRect();
            const btnRect = activeBtn.getBoundingClientRect();
            tabsContainer.style.setProperty('--tab-width', btnRect.width + 'px');
            tabsContainer.style.setProperty('--tab-offset', (btnRect.left - containerRect.left - 2) + 'px');
        }

        toggleButtons.forEach(button => {
            button.addEventListener('click', () => {
                const cvdType = button.dataset.cvdType;

                if (cvdType === currentCVDType && cvdType !== 'normal') {
                    currentCVDType = 'normal';
                } else {
                    currentCVDType = cvdType;
                }

                toggleButtons.forEach(btn => {
                    btn.classList.remove('active');
                    btn.setAttribute('aria-checked', 'false');
                });

                const activeBtn = currentCVDType === 'normal'
                    ? document.querySelector('[data-cvd-type="normal"]')
                    : button;
                if (activeBtn) {
                    activeBtn.classList.add('active');
                    activeBtn.setAttribute('aria-checked', 'true');
                }

                slideToTab(activeBtn);
                updateSVGFilter(currentCVDType, currentSeverity);
                applyFilterToMap(currentCVDType);
                updateLegend(currentCVDType, currentSeverity);
                updateCVDInfoBox(currentCVDType);
                updateSliderVisibility(currentCVDType);
            });
        });

        // Position pill on load without animating from 0
        const initialActive = document.querySelector('.seg-tab.active');
        requestAnimationFrame(() => {
            if (tabsContainer) tabsContainer.style.setProperty('--no-transition', '1');
            slideToTab(initialActive);
            // Re-enable transition after the first paint
            requestAnimationFrame(() => tabsContainer && tabsContainer.style.removeProperty('--no-transition'));
        });
    }

    function initSeveritySlider() {
        const slider = document.getElementById('severity-slider');
        const badge = document.getElementById('severity-value');
        if (!slider) return;

        function updateSliderTrack() {
            const pct = slider.value + '%';
            slider.style.background = `linear-gradient(to right, #02051f ${pct}, #e2e4e8 ${pct})`;
        }

        slider.addEventListener('input', () => {
            currentSeverity = parseInt(slider.value) / 100;
            if (badge) badge.textContent = slider.value + '%';
            updateSliderTrack();
            updateSVGFilter(currentCVDType, currentSeverity);
            applyFilterToMap(currentCVDType);
            updateLegend(currentCVDType, currentSeverity);
        });

        updateSliderTrack();
    }

    function updateSliderVisibility(cvdType) {
        const sliderGroup = document.querySelector('.sim-group--severity');
        const legendBar = document.getElementById('legend-bar');
        const isNormal = cvdType === 'normal';
        if (sliderGroup) sliderGroup.style.display = isNormal ? 'none' : '';
        if (legendBar) legendBar.classList.toggle('legend-bar--normal', isNormal);
    }

    function updateLegend(cvdType, severity) {
        Object.entries(UBAHN_LINES).forEach(([linfo, line]) => {
            const simSwatch = document.getElementById(`sim-swatch-${line.name}`);
            if (!simSwatch) return;

            if (cvdType === 'normal' || severity === 0) {
                simSwatch.style.backgroundColor = line.color;
            } else {
                const originalRgb = hexToRgb(line.color);
                const matrix = interpolateMatrix(CVD_MATRICES[cvdType], severity);
                const simulatedRgb = simulateColor(originalRgb, matrix);
                simSwatch.style.backgroundColor = rgbToHex(simulatedRgb);
            }
        });
    }

    function updateCVDInfoBox(cvdType) {
        const infoBox = document.getElementById('cvd-info-box');
        if (!infoBox) return;

        if (cvdType === 'normal') {
            infoBox.innerHTML = `<span class="cvd-info-box__title">Normal vision:</span> Colours appear clear and easy to distinguish on the map.`;
        } else {
            const desc = CVD_DESCRIPTIONS[cvdType];
            if (!desc) return;
            infoBox.innerHTML = `<span class="cvd-info-box__title">${desc.title}:&nbsp;</span>${desc.effect}`;
        }
    }

    /* ---------- Panel collapse toggle ---------- */

    function initPanelCollapse() {
        const button = document.getElementById('simulator-collapse');
        const bodyEl = document.getElementById('simulator-body');
        if (!button || !bodyEl) return;
        button.addEventListener('click', () => {
            const collapsed = bodyEl.classList.toggle('hidden');
            button.setAttribute('aria-expanded', String(!collapsed));
        });
    }

    /* ---------- Custom map controls ---------- */

    function initMapControls(mapInstance) {
        document.getElementById('zoom-in')?.addEventListener('click', () => mapInstance.zoomIn());
        document.getElementById('zoom-out')?.addEventListener('click', () => mapInstance.zoomOut());
        document.getElementById('compass-btn')?.addEventListener('click', () => mapInstance.resetNorth({ duration: 500 }));
        // Sidebar toggle mirrors the panel collapse button
        document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
            document.getElementById('simulator-collapse')?.click();
        });
    }

    /* ---------- Wire Up ---------- */

    initCVDToggles();
    initSeveritySlider();
    initPanelCollapse();
    initMapControls(map);

    // Default: normal vision (no simulation)
    currentCVDType = 'normal';
    currentSeverity = 0.5;
    updateSVGFilter('normal', 0.5);
    applyFilterToMap('normal');
    updateCVDInfoBox('normal');
    updateLegend('normal', 0.5);
    updateSliderVisibility('normal');
}


/* ============================================================
   INITIALIZATION
   
   Nav toggle runs on every page.
   Map page logic only runs when the #map container exists
   (i.e. only on map.html).
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    // Navigation — all pages
    initNavToggle();

    // Map page — only when MapLibre map container is present
    if (document.getElementById('map')) {
        initMapPage();
    }
});
