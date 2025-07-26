// static/app.js
class GeoDataViewer {
  constructor() {
    this.map = null;
    this.baseMaps = null;
    this.currentRasterLayer = null;
    this.currentVectorLayer = null;
    this.currentBounds = null;
    this.currentFilename = null;
    this.currentFileType = null; // 'geotiff' or 'geojson'
    this.initializeMap();
    this.setupEventListeners();
  }

  initializeMap() {
    // Setup basemaps
    const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap contributors", maxZoom: 22 });
    const satellite = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { attribution: "Tiles © Esri & contributors", maxZoom: 22 });
    const streets = L.tileLayer("https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap France contributors", maxZoom: 22 });
    this.baseMaps = { "OpenStreetMap": osm, "Satellite": satellite, "Streets": streets };
    this.map = L.map("map", {
      center: [40.7128, -74.0060],
      zoom: 2,
      zoomControl: true,
      layers: [osm],
    });
    L.control.layers(this.baseMaps).addTo(this.map);
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
        this.uploadFile(fileInput.files[0]);
      } else {
        this.showMessage("Please select a file first", "error");
      }
    });
    fileInput.addEventListener("change", (e) => {
      const hasFile = e.target.files.length > 0;
      uploadBtn.disabled = !hasFile;
      if (hasFile) {
        const file = e.target.files[0];
        const name = file.name.toLowerCase();
        if (name.endsWith('.tif') || name.endsWith('.tiff')) this.currentFileType = 'geotiff';
        else if (name.endsWith('.geojson') || name.endsWith('.json')) this.currentFileType = 'geojson';
        else {
          this.showMessage("Unsupported file type. Please upload a GeoTIFF (.tif/.tiff) or GeoJSON (.geojson/.json) file.", "error");
          uploadBtn.disabled = true;
        }
      }
    });

    opacitySlider.addEventListener("input", (e) => {
      const opacity = parseFloat(e.target.value);
      opacityValue.textContent = `${Math.round(opacity * 100)}%`;
      if (this.currentRasterLayer) this.currentRasterLayer.setOpacity(opacity);
      if (this.currentVectorLayer) this.currentVectorLayer.setStyle({ opacity: opacity, fillOpacity: opacity * 0.3 });
    });
    fitBoundsBtn.addEventListener("click", () => this.fitToBounds());
    resetViewBtn.addEventListener("click", () => this.resetView());

    // Drag and drop
    const mapContainer = document.getElementById("mapContainer");
    mapContainer.addEventListener("dragover", (e) => { e.preventDefault(); mapContainer.classList.add("drag-over"); });
    mapContainer.addEventListener("dragleave", (e) => { e.preventDefault(); mapContainer.classList.remove("drag-over"); });
    mapContainer.addEventListener("drop", (e) => {
      e.preventDefault(); mapContainer.classList.remove("drag-over");
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        fileInput.files = files;
        fileInput.dispatchEvent(new Event("change"));
      }
    });
  }

  async uploadFile(file) {
    const name = file.name.toLowerCase();
    if (name.endsWith('.tif') || name.endsWith('.tiff')) await this.uploadGeoTIFF(file);
    else if (name.endsWith('.geojson') || name.endsWith('.json')) await this.uploadGeoJSON(file);
    else this.showMessage("Unsupported file type. Please upload a GeoTIFF or GeoJSON file.", "error");
  }

  async uploadGeoTIFF(file) {
    const loading = document.getElementById("loadingIndicator");
    const uploadBtn = document.getElementById("uploadBtn");
    try {
      loading.classList.remove("hidden");
      uploadBtn.disabled = true;
      const formData = new FormData(); formData.append("file", file);
      const resp = await fetch("/upload", { method: "POST", body: formData });
      const res = await resp.json();
      if (!resp.ok) throw new Error(res.detail || `Upload failed: ${resp.statusText}`);
      if (res.success) {
        this.currentFilename = res.filename;
        this.currentBounds = res.bounds;
        this.currentFileType = "geotiff";
        this.updateFileInfo(res);
        this.addGeoTIFFLayer(res.filename);
        document.getElementById("fitBoundsBtn").disabled = false;
        this.showMessage(`Successfully uploaded GeoTIFF: ${res.filename}`, "success");
      }
    } catch (err) {
      this.showMessage(`Upload failed: ${err.message}`, "error");
    } finally {
      loading.classList.add("hidden");
      uploadBtn.disabled = false;
    }
  }

  async uploadGeoJSON(file) {
    const loading = document.getElementById("loadingIndicator");
    const uploadBtn = document.getElementById("uploadBtn");
    try {
      loading.classList.remove("hidden");
      uploadBtn.disabled = true;
      const formData = new FormData(); formData.append("file", file);
      const resp = await fetch("/upload_geojson", { method: "POST", body: formData });
      const res = await resp.json();
      if (!resp.ok) throw new Error(res.detail || `Upload failed: ${resp.statusText}`);
      if (res.success) {
        // Load processed JSON from backend
        const r = await fetch(res.url); if (!r.ok) throw new Error("Failed to load processed GeoJSON");
        const geojsonData = await r.json();
        this.currentFilename = res.filename;
        this.currentFileType = "geojson";
        this.updateGeoJSONInfo({ ...res, feature_count: res.feature_count });
        this.addGeoJSONLayer(geojsonData);
        document.getElementById("fitBoundsBtn").disabled = false;
        this.showMessage(`Successfully uploaded GeoJSON: ${res.filename}`, "success");
      }
    } catch (err) {
      this.showMessage(`Upload failed: ${err.message}`, "error");
    } finally {
      loading.classList.add("hidden");
      uploadBtn.disabled = false;
    }
  }

  addGeoTIFFLayer(filename) {
    if (this.currentRasterLayer) this.map.removeLayer(this.currentRasterLayer);
    if (this.currentVectorLayer) this.map.removeLayer(this.currentVectorLayer);
    this.currentRasterLayer = L.tileLayer(`/tile/${filename}/{z}/{x}/{y}.png`, {
      attribution: `GeoTIFF: ${filename}`,
      opacity: parseFloat(document.getElementById("opacitySlider").value),
      maxZoom: 22,
      bounds: [
        [this.currentBounds[1], this.currentBounds[0]],
        [this.currentBounds[3], this.currentBounds[2]],
      ],
      noWrap: true,
      errorTileUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
    }).addTo(this.map);
    this.fitToBounds();
  }

  addGeoJSONLayer(geojsonData) {
    if (this.currentVectorLayer) this.map.removeLayer(this.currentVectorLayer);
    if (this.currentRasterLayer) this.map.removeLayer(this.currentRasterLayer);
    const opacity = parseFloat(document.getElementById("opacitySlider").value);
    this.currentVectorLayer = L.geoJSON(geojsonData, {
      style: { color: "#ff7800", weight: 2, opacity: opacity, fillOpacity: opacity * 0.3, fillColor: "#ff7800" },
      onEachFeature: (feature, layer) => {
        if (feature.properties && Object.keys(feature.properties).length > 0) {
          const popupContent = Object.entries(feature.properties).map(([k, v]) => `<strong>${k}:</strong> ${v}`).join("<br>");
          layer.bindPopup(popupContent);
        }
      },
    }).addTo(this.map);
    this.fitToBounds();
  }

  fitToBounds() {
    if (this.currentBounds && this.currentFileType === "geotiff") {
      this.map.fitBounds([
        [this.currentBounds[1], this.currentBounds[0]],
        [this.currentBounds[3], this.currentBounds[2]],
      ], { padding: [20, 20] });
    } else if (this.currentVectorLayer) {
      this.map.fitBounds(this.currentVectorLayer.getBounds(), { padding: [20, 20] });
    }
  }

  resetView() {
    this.map.setView([40.7128, -74.0060], 2);
  }

  updateCoordinates(latlng) {
    document.getElementById("coordinates").textContent = `Lat: ${latlng.lat.toFixed(6)}, Lng: ${latlng.lng.toFixed(6)}`;
  }
  updateZoom() { document.getElementById("zoom").textContent = `Zoom: ${this.map.getZoom()}`; }
  updateFileInfo(fileData) {
    document.getElementById("fileInfo").innerHTML = `
      <p><strong>Filename:</strong> ${fileData.filename}</p>
      <p><strong>Type:</strong> GeoTIFF</p>
      <p><strong>Dimensions:</strong> ${fileData.width} × ${fileData.height}</p>
      <p><strong>Bands:</strong> ${fileData.bands}</p>
      <p><strong>CRS:</strong> ${fileData.crs}</p>
      <p><strong>Bounds:</strong></p>
      <p style="margin-left: 1rem; font-size: 0.8rem;">
        West: ${fileData.bounds[0].toFixed(6)}<br>South: ${fileData.bounds[1].toFixed(6)}<br>East: ${fileData.bounds[2].toFixed(6)}<br>North: ${fileData.bounds[3].toFixed(6)}
      </p>
    `;
  }
  updateGeoJSONInfo(fileData) {
    document.getElementById("fileInfo").innerHTML = `
      <p><strong>Filename:</strong> ${fileData.filename}</p>
      <p><strong>Type:</strong> GeoJSON</p>
      <p><strong>Features:</strong> ${fileData.feature_count}</p>
      <p><strong>CRS:</strong> EPSG:4326 (WGS84)</p>
    `;
  }

  showMessage(message, type = "info") {
    let messageElement = document.getElementById("messageContainer");
    if (!messageElement) {
      messageElement = document.createElement("div");
      messageElement.id = "messageContainer";
      messageElement.style.cssText = `
        position: fixed; top: 20px; right: 20px; z-index: 10000; max-width: 300px;
      `;
      document.body.appendChild(messageElement);
    }
    const messageDiv = document.createElement("div");
    messageDiv.style.cssText = `
      padding: 12px 16px; margin-bottom: 10px; border-radius: 4px; color: white; font-size: 14px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2); animation: slideIn 0.3s ease-out;
      background-color: ${type === "error" ? "#dc3545" : type === "success" ? "#28a745" : "#007bff"};
    `;
    messageDiv.textContent = message;
    messageElement.appendChild(messageDiv);
    setTimeout(() => {
      if (messageDiv.parentNode) {
        messageDiv.style.animation = "slideOut 0.3s ease-in";
        setTimeout(() => { if (messageDiv.parentNode) messageDiv.parentNode.removeChild(messageDiv); }, 300);
      }
    }, 5000);
  }
}

// CSS for message animations and drag overlay
const style = document.createElement("style");
style.textContent = `
  @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
  @keyframes slideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }
  .drag-over { border: 2px dashed #007bff !important; background-color: rgba(0, 123, 255, 0.1) !important; }
`;
document.head.appendChild(style);

document.addEventListener("DOMContentLoaded", () => { new GeoDataViewer(); });
