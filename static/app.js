class GeoTIFFViewer {
<<<<<<< HEAD
  constructor() {
    this.map = null;
    this.currentLayer = null;
    this.currentBounds = null; // [west, south, east, north]
    this.currentFilename = null;

    this.initializeMap();
    this.setupEventListeners();
  }

  initializeMap() {
    // Initialize Leaflet map centered on NYC with zoom level 2
    this.map = L.map('map', {
      center: [40.7128, -74.0060],
      zoom: 2,
      zoomControl: true,
    });

    // Add OpenStreetMap basemap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(this.map);

    // Update coordinates display when mouse moves
    this.map.on('mousemove', (e) => {
      this.updateCoordinates(e.latlng);
    });

    // Update zoom level display on zoom end
    this.map.on('zoomend', () => {
      this.updateZoom();
    });

    // Initial zoom display
    this.updateZoom();
  }

  setupEventListeners() {
    const fileInput = document.getElementById('fileInput');
    const uploadBtn = document.getElementById('uploadBtn');
    const opacitySlider = document.getElementById('opacitySlider');
    const opacityValue = document.getElementById('opacityValue');
    const fitBoundsBtn = document.getElementById('fitBoundsBtn');
    const resetViewBtn = document.getElementById('resetViewBtn');

    // Upload button enables upload of selected file
    uploadBtn.addEventListener('click', () => {
      if (fileInput.files.length > 0) {
        this.uploadFile(fileInput.files[0]);
      } else {
        alert('Please select a GeoTIFF file first');
      }
    });

    // Enable upload button only when file selected
    fileInput.addEventListener('change', (e) => {
      uploadBtn.disabled = !(e.target.files.length > 0);
    });

    // Opacity slider controls tile layer opacity
    opacitySlider.addEventListener('input', (e) => {
      const opacity = parseFloat(e.target.value);
      opacityValue.textContent = `${Math.round(opacity * 100)}%`;
      if (this.currentLayer) {
        this.currentLayer.setOpacity(opacity);
      }
    });

    // Fit map view to GeoTIFF bounds
    fitBoundsBtn.addEventListener('click', () => {
      this.fitToBounds();
    });

    // Reset map to default view
    resetViewBtn.addEventListener('click', () => {
      this.resetView();
    });
  }

  async uploadFile(file) {
    const loadingIndicator = document.getElementById('loadingIndicator');
    const uploadBtn = document.getElementById('uploadBtn');

    try {
      loadingIndicator.classList.remove('hidden');
      uploadBtn.disabled = true;

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const result = await response.json();

      if (result.success) {
        this.currentFilename = result.filename;
        this.currentBounds = result.bounds;

        this.updateFileInfo(result);
        this.addGeoTIFFLayer(result.filename);

        document.getElementById('fitBoundsBtn').disabled = false;

        console.log('File uploaded successfully:', result);
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert(`Upload failed: ${error.message}`);
    } finally {
      loadingIndicator.classList.add('hidden');
      uploadBtn.disabled = false;
    }
  }

  addGeoTIFFLayer(filename) {
    // Remove existing GeoTIFF layer
    if (this.currentLayer) {
      this.map.removeLayer(this.currentLayer);
    }

    if (!this.currentBounds) {
      console.warn('No bounds available to set layer bounds.');
    }

    // Create tile layer with explicit layer bounds and disable wrapping
    this.currentLayer = L.tileLayer(`/tile/${filename}/{z}/{x}/{y}.png`, {
      attribution: `GeoTIFF: ${filename}`,
      opacity: parseFloat(document.getElementById('opacitySlider').value),
      maxZoom: 18,
      bounds: [
        [this.currentBounds[1], this.currentBounds[0]], // southwest: [lat, lng]
        [this.currentBounds[3], this.currentBounds[2]], // northeast: [lat, lng]
      ],
      noWrap: true, // prevent repeated horizontal wrapping
      // Optimize tile loading by keeping buffer around edge minimal if needed
    });

    this.currentLayer.addTo(this.map);

    // Auto fit map to layer bounds if available
    if (this.currentBounds) {
      this.fitToBounds();
    }
  }

  updateFileInfo(fileData) {
    const fileInfo = document.getElementById('fileInfo');

    fileInfo.innerHTML = `
      <p><strong>Filename:</strong> ${fileData.filename}</p>
      <p><strong>Dimensions:</strong> ${fileData.width} × ${fileData.height}</p>
      <p><strong>Bands:</strong> ${fileData.bands}</p>
      <p><strong>CRS:</strong> ${fileData.crs}</p>
      <p><strong>Bounds:</strong></p>
      <p style="margin-left: 1rem; font-size: 0.8rem;">
        West: ${fileData.bounds[0].toFixed(6)}<br>
        South: ${fileData.bounds[1].toFixed(6)}<br>
        East: ${fileData.bounds[2].toFixed(6)}<br>
        North: ${fileData.bounds[3].toFixed(6)}
      </p>`;
  }

  fitToBounds() {
    if (this.currentBounds) {
      const bounds = [
        [this.currentBounds[1], this.currentBounds[0]], // southwest lat,lng
        [this.currentBounds[3], this.currentBounds[2]], // northeast lat,lng
      ];
      this.map.fitBounds(bounds, { padding: [20, 20] });
    }
  }

  resetView() {
    this.map.setView([40.7128, -74.0060], 2);
  }

  updateCoordinates(latlng) {
    const coordsElement = document.getElementById('coordinates');
    coordsElement.textContent = `Lat: ${latlng.lat.toFixed(6)}, Lng: ${latlng.lng.toFixed(6)}`;
  }

  updateZoom() {
    const zoomElement = document.getElementById('zoom');
    zoomElement.textContent = `Zoom: ${this.map.getZoom()}`;
  }
=======
    constructor() {
        this.map = null;
        this.currentLayer = null;
        this.currentBounds = null;
        this.currentFilename = null;
        
        this.initializeMap();
        this.setupEventListeners();
    }
    
    initializeMap() {
        // Initialize Leaflet map
        this.map = L.map('map', {
            center: [40.7128, -74.0060], // Default to NYC
            zoom: 2,
            zoomControl: true
        });
        
        // Add base layer
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 18
        }).addTo(this.map);
        
        // Update coordinates and zoom on mouse move and zoom
        this.map.on('mousemove', (e) => {
            this.updateCoordinates(e.latlng);
        });
        
        this.map.on('zoomend', () => {
            this.updateZoom();
        });
        
        // Initial coordinate and zoom display
        this.updateZoom();
    }
    
    setupEventListeners() {
        // File upload
        const fileInput = document.getElementById('fileInput');
        const uploadBtn = document.getElementById('uploadBtn');
        
        uploadBtn.addEventListener('click', () => {
            if (fileInput.files.length > 0) {
                this.uploadFile(fileInput.files[0]);
            } else {
                alert('Please select a GeoTIFF file first');
            }
        });
        
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                uploadBtn.disabled = false;
            }
        });
        
        // Opacity slider
        const opacitySlider = document.getElementById('opacitySlider');
        const opacityValue = document.getElementById('opacityValue');
        
        opacitySlider.addEventListener('input', (e) => {
            const opacity = parseFloat(e.target.value);
            opacityValue.textContent = `${Math.round(opacity * 100)}%`;
            
            if (this.currentLayer) {
                this.currentLayer.setOpacity(opacity);
            }
        });
        
        // Map controls
        document.getElementById('fitBoundsBtn').addEventListener('click', () => {
            this.fitToBounds();
        });
        
        document.getElementById('resetViewBtn').addEventListener('click', () => {
            this.resetView();
        });
    }
    
    async uploadFile(file) {
        const loadingIndicator = document.getElementById('loadingIndicator');
        const uploadBtn = document.getElementById('uploadBtn');
        
        try {
            // Show loading indicator
            loadingIndicator.classList.remove('hidden');
            uploadBtn.disabled = true;
            
            // Create FormData and upload
            const formData = new FormData();
            formData.append('file', file);
            
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                throw new Error(`Upload failed: ${response.statusText}`);
            }
            
            const result = await response.json();
            
            if (result.success) {
                this.currentFilename = result.filename;
                this.currentBounds = result.bounds;
                
                // Update file info
                this.updateFileInfo(result);
                
                // Add GeoTIFF layer to map
                this.addGeoTIFFLayer(result.filename);
                
                // Enable fit bounds button
                document.getElementById('fitBoundsBtn').disabled = false;
                
                console.log('File uploaded successfully:', result);
            }
            
        } catch (error) {
            console.error('Upload error:', error);
            alert(`Upload failed: ${error.message}`);
        } finally {
            // Hide loading indicator
            loadingIndicator.classList.add('hidden');
            uploadBtn.disabled = false;
        }
    }
    
    addGeoTIFFLayer(filename) {
        // Remove existing layer if any
        if (this.currentLayer) {
            this.map.removeLayer(this.currentLayer);
        }
        
        // Create tile layer for the GeoTIFF
        this.currentLayer = L.tileLayer(`/tile/${filename}/{z}/{x}/{y}.png`, {
            attribution: `GeoTIFF: ${filename}`,
            opacity: parseFloat(document.getElementById('opacitySlider').value),
            maxZoom: 18
        });
        
        // Add to map
        this.currentLayer.addTo(this.map);
        
        // Fit to bounds if available
        if (this.currentBounds) {
            this.fitToBounds();
        }
    }
    
    updateFileInfo(fileData) {
        const fileInfo = document.getElementById('fileInfo');
        
        const html = `
            <p><strong>Filename:</strong> ${fileData.filename}</p>
            <p><strong>Dimensions:</strong> ${fileData.width} × ${fileData.height}</p>
            <p><strong>Bands:</strong> ${fileData.bands}</p>
            <p><strong>CRS:</strong> ${fileData.crs}</p>
            <p><strong>Bounds:</strong></p>
            <p style="margin-left: 1rem; font-size: 0.8rem;">
                West: ${fileData.bounds[0].toFixed(6)}<br>
                South: ${fileData.bounds[1].toFixed(6)}<br>
                East: ${fileData.bounds[2].toFixed(6)}<br>
                North: ${fileData.bounds[3].toFixed(6)}
            </p>
        `;
        
        fileInfo.innerHTML = html;
    }
    
    fitToBounds() {
        if (this.currentBounds) {
            // Convert bounds to Leaflet format [southwest, northeast]
            const bounds = [
                [this.currentBounds[1], this.currentBounds[0]], // southwest
                [this.currentBounds[3], this.currentBounds[2]]  // northeast
            ];
            
            this.map.fitBounds(bounds, { padding: [20, 20] });
        }
    }
    
    resetView() {
        this.map.setView([40.7128, -74.0060], 2);
    }
    
    updateCoordinates(latlng) {
        const coordsElement = document.getElementById('coordinates');
        coordsElement.textContent = `Lat: ${latlng.lat.toFixed(6)}, Lng: ${latlng.lng.toFixed(6)}`;
    }
    
    updateZoom() {
        const zoomElement = document.getElementById('zoom');
        zoomElement.textContent = `Zoom: ${this.map.getZoom()}`;
    }
    
    async getDetailedFileInfo(filename) {
        try {
            const response = await fetch(`/info/${filename}`);
            if (response.ok) {
                const info = await response.json();
                console.log('Detailed file info:', info);
                return info;
            }
        } catch (error) {
            console.error('Error getting file info:', error);
        }
        return null;
    }
>>>>>>> origin/main
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', () => {
<<<<<<< HEAD
  new GeoTIFFViewer();
=======
    new GeoTIFFViewer();
>>>>>>> origin/main
});
