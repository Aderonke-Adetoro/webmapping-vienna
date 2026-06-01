# MapLens: Color Accessibility of Vienna's Transit Map 
Vienna's public transit map relies heavily on color to distinguish U-Bahn lines. This project investigates how effectively the map communicates to users with different types of color vision deficiency (CVD). We will build an interactive web map of Vienna's U-Bahn network using official color schemes, then provide real-time simulations of how the map appears under protanopia, deuteranopia, tritanopia, and/or achromatopsia. Users can toggle between vision types, compare the original and simulated views side by side, and see quantitative WCAG contrast scores for each line pair. The site will also include ground-truth comparisons with physical maps at Vienna transit stations, research on CVD and cartographic best practices, and examples of how other cities have addressed this challenge. 

## Site Structure 
### Page 1: Landing / Introduction (index.html) 
• Project title, brief hook explaining the problem 
• Key statistic: ~8% of men and ~0.5% of women have some form of CVD 
• Visual teaser: same map section shown in normal vision vs. deuteranopia side by side • Navigation to all sections 
### Page 2: The Interactive Map (map.html) 
• Full-screen interactive Leaflet map of Vienna's U-Bahn + tram network 
• Control panel with: 
– CVD simulation toggle (Normal, Protanopia, Deuteranopia, Tritanopia, Achromatopsia) – Line visibility toggles (show/hide individual lines) 
– Legend that updates dynamically to reflect simulated colors 
• Info panel showing: 
– WCAG contrast ratios between confusable line pairs under current simulation 
– Pass/fail indicators against WCAG 1.4.1 and 1.4.11 thresholds 
• Optional: split-screen or swipe comparison (normal vs. simulated) 
### Page 3: Understanding Color Vision Deficiency (about-cvd.html) 
• Types of CVD with brief, clear explanations 
• How CVD affects map reading specifically 
• The mathematics behind the simulation (color matrix transformation)
• Relevant WCAG guidelines (1.4.1 Use of Color, 1.4.3 Contrast, 1.4.11 Non-text Contrast)  
### Page 4: About / Methods (about.html) 
• Team members, course context 
• Data sources and attributions 
• Technical methods and tools used 
• References and further reading 


## Technical Stack 
#### --> Maplibre for basemap and slider
#### --> HTML / CSS / JS 
#### --> SVG feColorMatrix filters
#### --> chroma.js for color matrix simulation
#### --> WIen Open Data (U-Bahn) 
#### --> Figma for design

### Key Technical Approach: SVG Filter Matrices 
The color blindness simulation uses <feColorMatrix> — an SVG filter that applies a 5x4 matrix to transform pixel color values. Published matrices exist for each CVD type (Machado et al., 2009 is the standard reference). This filter is applied to the map container element, so all rendered content — lines, labels, legend — is transformed simultaneously and accurately. 
### Data Sources 
Data Source Format U-Bahn route geometries data.gv.at (City of Vienna Open Data) GeoJSON. Official line colors Wiener Linien brand guidelines Hex codes Station locations data.gv.at / OpenStreetMap GeoJSON CVD simulation matrices Machado, Oliveira & Fernandes (2009) Published 

