class GeoDataViewer {
  constructor() {
    this.map = null;
    this.currentRasterLayer = null;
    this.currentVectorLayer = null;
    this.currentBounds = null; // [west, south, east, north]
    this.currentFilename = null;
    this.currentFileType = null; // 'geotiff' or 'geojson'

    this.initializeMap();
    this.setupEventListeners();
  }

  initializeMap() {
    this.map = L.map("map", {
      center: [40.7128, -74.0060],
      zoom: 2,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 22,
    }).addTo(this.map);

    this.map.on("mousemove", (e) => this.updateCoordinates(e.latlng));
    this.map.on("zoomend", () => this.updateZoom());
    this.updateZoom();
  }

  setupEventListeners() {
    const fileInput = document.getElementById("fileInput");
    const uploadBtn = document.getElementById("uploadBtn");
    const opacitySlider = document.getElementById("opacitySlider");
    const opacityValue = document.getElementById("opacityValue");
    const fitBoundsBtn = document.getElementById("fitBoundsBtn");
    const resetViewBtn = document.getElementById("resetViewBtn");

    uploadBtn.addEventListener("click", () => {
      if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        this.uploadFile(file);
      } else {
        this.showMessage("Please select a file first", "error");
      }
    });

    fileInput.addEventListener("change", (e) => {
      const hasFile = e.target.files.length > 0;
      uploadBtn.disabled = !hasFile;
      
      if (hasFile) {
        const file = e.target.files[0];
        const fileName = file.name.toLowerCase();
        
        if (fileName.endsWith(".tif") || fileName.endsWith(".tiff")) {
          this.currentFileType = "geotiff";
        } else if (fileName.endsWith(".geojson") || fileName.endsWith(".json")) {
          this.currentFileType = "geojson";
        } else {
          this.showMessage("Unsupported file type. Please upload a GeoTIFF (.tif/.tiff) or GeoJSON (.geojson/.json) file.", "error");
          uploadBtn.disabled = true;
          return;
        }
      }
    });

    opacitySlider.addEventListener("input", (e) => {
      const opacity = parseFloat(e.target.value);
      opacityValue.textContent = `${Math.round(opacity * 100)}%`;
      
      if (this.currentRasterLayer) {
        this.currentRasterLayer.setOpacity(opacity);
      }
      if (this.currentVectorLayer) {
        this.currentVectorLayer.setStyle({ opacity: opacity, fillOpacity: opacity * 0.3 });
      }
    });

    fitBoundsBtn.addEventListener("click", () => this.fitToBounds());
    resetViewBtn.addEventListener("click", () => this.resetView());

    // Handle drag and drop
    const mapContainer = document.getElementById("mapContainer");
    
    mapContainer.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
      mapContainer.classList.add("drag-over");
    });

    mapContainer.addEventListener("dragleave", (e) => {
      e.preventDefault();
      e.stopPropagation();
      mapContainer.classList.remove("drag-over");
    });

    mapContainer.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      mapContainer.classList.remove("drag-over");
      
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        fileInput.files = files;
        fileInput.dispatchEvent(new Event("change"));
      }
    });
  }

  async uploadFile(file) {
    const fileName = file.name.toLowerCase();
    
    if (fileName.endsWith(".tif") || fileName.endsWith(".tiff")) {
      await this.uploadGeoTIFF(file);
    } else if (fileName.endsWith(".geojson") || fileName.endsWith(".json")) {
      await this.uploadGeoJSON(file);
    } else {
      this.showMessage("Unsupported file type. Please upload a GeoTIFF or GeoJSON file.", "error");
    }
  }

  async uploadGeoTIFF(file) {
    const loadingIndicator = document.getElementById("loadingIndicator");
    const uploadBtn = document.getElementById("uploadBtn");

    try {
      loadingIndicator.classList.remove("hidden");
      uploadBtn.disabled = true;

      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/upload", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || `Upload failed: ${response.statusText}`);
      }

      if (result.success) {
        this.currentFilename = result.filename;
        this.currentBounds = result.bounds;
        this.currentFileType = "geotiff";

        this.updateFileInfo(result);
        this.addGeoTIFFLayer(result.filename);
        document.getElementById("fitBoundsBtn").disabled = false;
        
        this.showMessage(`Successfully uploaded GeoTIFF: ${result.filename}`, "success");
      }
    } catch (error) {
      console.error("Upload error:", error);
      this.showMessage(`Upload failed: ${error.message}`, "error");
    } finally {
      loadingIndicator.classList.add("hidden");
      uploadBtn.disabled = false;
    }
  }

  async uploadGeoJSON(file) {
    const loadingIndicator = document.getElementById("loadingIndicator");
    const uploadBtn = document.getElementById("uploadBtn");

    try {
      loadingIndicator.classList.remove("hidden");
      uploadBtn.disabled = true;

      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/upload_geojson", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || `Upload failed: ${response.statusText}`);
      }

      if (result.success) {
        // Load the processed GeoJSON
        const geojsonResponse = await fetch(result.url);
        if (!geojsonResponse.ok) {
          throw new Error("Failed to load processed GeoJSON");
        }
        
        const geojsonData = await geojsonResponse.json();
        this.currentFilename = result.filename;
        this.currentFileType = "geojson";

        this.updateGeoJSONInfo(result);
        this.addGeoJSONLayer(geojsonData);
        document.getElementById("fitBoundsBtn").disabled = false;
        
        this.showMessage(`Successfully uploaded GeoJSON: ${result.filename} (${result.feature_count} features)`, "success");
      }
    } catch (error) {
      console.error("Upload error:", error);
      this.showMessage(`Upload failed: ${error.message}`, "error");
    } finally {
      loadingIndicator.classList.add("hidden");
      uploadBtn.disabled = false;
    }
  }

  addGeoTIFFLayer(filename) {
    // Remove existing layers
    if (this.currentRasterLayer) {
      this.map.removeLayer(this.currentRasterLayer);
      this.currentRasterLayer = null;
    }
    if (this.currentVectorLayer) {
      this.map.removeLayer(this.currentVectorLayer);
      this.currentVectorLayer = null;
    }

    this.currentRasterLayer = L.tileLayer(`/tile/${filename}/{z}/{x}/{y}.png`, {
      attribution: `GeoTIFF: ${filename}`,
      opacity: parseFloat(document.getElementById("opacitySlider").value),
      maxZoom: 22,
      bounds: [
        [this.currentBounds[1], this.currentBounds[0]],
        [this.currentBounds[3], this.currentBounds[2]],
      ],
      noWrap: true,
      errorTileUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==", // transparent 1x1 pixel
    });

    this.currentRasterLayer.addTo(this.map);
    this.fitToBounds();
  }

  addGeoJSONLayer(geojsonData) {
    // Remove existing layers
    if (this.currentVectorLayer) {
      this.map.removeLayer(this.currentVectorLayer);
      this.currentVectorLayer = null;
    }
    if (this.currentRasterLayer) {
      this.map.removeLayer(this.currentRasterLayer);
      this.currentRasterLayer = null;
    }

    const opacity = parseFloat(document.getElementById("opacitySlider").value);

    this.currentVectorLayer = L.geoJSON(geojsonData, {
      style: {
        color: "#ff7800",
        weight: 2,
        opacity: opacity,
        fillOpacity: opacity * 0.3,
        fillColor: "#ff7800"
      },
      onEachFeature: (feature, layer) => {
        if (feature.properties && Object.keys(feature.properties).length > 0) {
          const popupContent = Object.entries(feature.properties)
            .map(([key, val]) => `<strong>${key}:</strong> ${val}`)
            .join("<br>");
          layer.bindPopup(popupContent);
        }
        
        // Add hover effects
        layer.on({
          mouseover: (e) => {
            const layer = e.target;
            layer.setStyle({
              weight: 3,
              color: '#666',
              dashArray: '',
              fillOpacity: 0.7
            });
            layer.bringToFront();
          },
          mouseout: (e) => {
            this.currentVectorLayer.resetStyle(e.target);
          }
        });
      },
    }).addTo(this.map);

    this.fitToBounds();
  }

  updateFileInfo(fileData) {
    const fileInfo = document.getElementById("fileInfo");
    fileInfo.innerHTML = `
      <p><strong>Filename:</strong> ${fileData.filename}</p>
      <p><strong>Type:</strong> GeoTIFF</p>
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
  }

  updateGeoJSONInfo(fileData) {
    const fileInfo = document.getElementById("fileInfo");
    fileInfo.innerHTML = `
      <p><strong>Filename:</strong> ${fileData.filename}</p>
      <p><strong>Type:</strong> GeoJSON</p>
      <p><strong>Features:</strong> ${fileData.feature_count}</p>
      <p><strong>CRS:</strong> EPSG:4326 (WGS84)</p>
    `;
  }

  fitToBounds() {
    if (this.currentBounds && this.currentFileType === "geotiff") {
      const bounds = [
        [this.currentBounds[1], this.currentBounds[0]],
        [this.currentBounds[3], this.currentBounds[2]],
      ];
      this.map.fitBounds(bounds, { padding: [20, 20] });
    } else if (this.currentVectorLayer) {
      this.map.fitBounds(this.currentVectorLayer.getBounds(), { padding: [20, 20] });
    }
  }

  resetView() {
    this.map.setView([40.7128, -74.0060], 2);
  }

  updateCoordinates(latlng) {
    const coordsElement = document.getElementById("coordinates");
    coordsElement.textContent = `Lat: ${latlng.lat.toFixed(6)}, Lng: ${latlng.lng.toFixed(6)}`;
  }

  updateZoom() {
    const zoomElement = document.getElementById("zoom");
    zoomElement.textContent = `Zoom: ${this.map.getZoom()}`;
  }

  showMessage(message, type = "info") {
    // Create message element if it doesn't exist
    let messageElement = document.getElementById("messageContainer");
    if (!messageElement) {
      messageElement = document.createElement("div");
      messageElement.id = "messageContainer";
      messageElement.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        max-width: 300px;
      `;
      document.body.appendChild(messageElement);
    }

    const messageDiv = document.createElement("div");
    messageDiv.style.cssText = `
      padding: 12px 16px;
      margin-bottom: 10px;
      border-radius: 4px;
      color: white;
      font-size: 14px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      animation: slideIn 0.3s ease-out;
      background-color: ${type === "error" ? "#dc3545" : type === "success" ? "#28a745" : "#007bff"};
    `;
    messageDiv.textContent = message;

    messageElement.appendChild(messageDiv);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (messageDiv.parentNode) {
        messageDiv.style.animation = "slideOut 0.3s ease-in";
        setTimeout(() => {
          if (messageDiv.parentNode) {
            messageDiv.parentNode.removeChild(messageDiv);
          }
        }, 300);
      }
    }, 5000);
  }
}

// Add CSS animations
const style = document.createElement("style");
style.textContent = `
  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(100%); opacity: 0; }
  }
  .drag-over {
    border: 2px dashed #007bff !important;
    background-color: rgba(0, 123, 255, 0.1) !important;
  }
`;
document.head.appendChild(style);

document.addEventListener("DOMContentLoaded", () => {
  new GeoDataViewer();
});
