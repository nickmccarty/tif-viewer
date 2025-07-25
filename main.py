from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, StreamingResponse, FileResponse
import rasterio
from rasterio.warp import transform_bounds
from rasterio.windows import from_bounds
from rasterio.crs import CRS
import numpy as np
from PIL import Image
import io
import os
import math

app = FastAPI(title="GeoTIFF & GeoJSON Viewer", description="A web-based viewer for GeoTIFF and GeoJSON using Leaflet")

# Directories for uploaded files
UPLOAD_DIR = "uploads"
GEOJSON_DIR = os.path.join(UPLOAD_DIR, "geojson")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(GEOJSON_DIR, exist_ok=True)

# Serve static files (HTML, JS, CSS)
app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/geojson", StaticFiles(directory=GEOJSON_DIR), name="geojson")

@app.get("/", response_class=HTMLResponse)
async def root():
    """Serve main HTML page"""
    with open("static/index.html", "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())

@app.post("/upload")
async def upload_geotiff(file: UploadFile = File(...)):
    """Upload a GeoTIFF file and return basic info"""
    if not file.filename.lower().endswith((".tif", ".tiff")):
        raise HTTPException(status_code=400, detail="File must be a GeoTIFF (.tif or .tiff)")

    file_path = os.path.join(UPLOAD_DIR, file.filename)

    # Save uploaded file
    with open(file_path, "wb") as buffer:
        content = await file.read()
        buffer.write(content)

    # Extract metadata
    try:
        with rasterio.open(file_path) as src:
            bounds = src.bounds
            crs = src.crs
            width = src.width
            height = src.height
            count = src.count

            return {
                "filename": file.filename,
                "bounds": [bounds.left, bounds.bottom, bounds.right, bounds.top],
                "crs": str(crs),
                "width": width,
                "height": height,
                "bands": count,
                "success": True,
            }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error processing GeoTIFF: {e}")

from fastapi import UploadFile, File
import os
import json
from pyproj import Transformer

@app.post("/upload_geojson")
async def upload_geojson(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".geojson"):
        raise HTTPException(status_code=400, detail="File must be GeoJSON")

    file_path = os.path.join(GEOJSON_DIR, file.filename)
    content = await file.read()
    geojson_data = json.loads(content)

    # Reproject if needed
    if geojson_data.get("crs"):
        import re
        match = re.search(r"EPSG::?(\d+)", geojson_data["crs"]["properties"]["name"])
        source_crs = match.group(1) if match else "4326"

        if source_crs != "4326":
            from pyproj import Transformer
            transformer = Transformer.from_crs(f"EPSG:{source_crs}", "EPSG:4326", always_xy=True)

            for feature in geojson_data["features"]:
                coords = feature["geometry"]["coordinates"]
                if feature["geometry"]["type"] == "Polygon":
                    new_coords = []
                    for ring in coords:
                        new_ring = [list(transformer.transform(x, y)) for x, y in ring]
                        new_coords.append(new_ring)
                    feature["geometry"]["coordinates"] = new_coords
                # Handle MultiPolygon, Point, LineString as needed

            geojson_data.pop("crs", None)

    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(geojson_data, f, indent=2)

    # Debug print sample coordinates
    print("Reprojected sample:", geojson_data["features"][0]["geometry"]["coordinates"][0][:3])

    return {"success": True, "filename": file.filename, "url": f"/geojson/{file.filename}"}


def tile2lon(x: int, z: int) -> float:
    return x / (2 ** z) * 360.0 - 180.0

def tile2lat(y: int, z: int) -> float:
    n = math.pi - 2.0 * math.pi * y / (2 ** z)
    return math.degrees(math.atan(math.sinh(n)))

def get_tile_bounds(x: int, y: int, z: int):
    lon_min = tile2lon(x, z)
    lon_max = tile2lon(x + 1, z)
    lat_min = tile2lat(y + 1, z)
    lat_max = tile2lat(y, z)
    merc_bounds = transform_bounds("EPSG:4326", "EPSG:3857", lon_min, lat_min, lon_max, lat_max, densify_pts=21)
    return merc_bounds

@app.get("/tile/{filename}/{z}/{x}/{y}.png")
async def get_tile(filename: str, z: int, x: int, y: int):
    """Generate a tile (PNG) for the given z/x/y from the uploaded GeoTIFF"""
    file_path = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    try:
        tile_img = generate_tile(file_path, z, x, y)
        img_io = io.BytesIO()
        tile_img.save(img_io, "PNG")
        img_io.seek(0)
        return StreamingResponse(img_io, media_type="image/png")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating tile: {e}")

def generate_tile(file_path: str, z: int, x: int, y: int, tile_size: int = 256) -> Image.Image:
    with rasterio.open(file_path) as src:
        tile_bounds_3857 = get_tile_bounds(x, y, z)

        if src.crs != CRS.from_epsg(3857):
            tile_bounds_src_crs = transform_bounds("EPSG:3857", src.crs, *tile_bounds_3857, densify_pts=21)
        else:
            tile_bounds_src_crs = tile_bounds_3857

        window = from_bounds(*tile_bounds_src_crs, transform=src.transform)

        if window.width <= 0 or window.height <= 0:
            return Image.new("RGBA", (tile_size, tile_size), (0, 0, 0, 0))

        data = src.read(
            1,
            window=window,
            out_shape=(tile_size, tile_size),
            resampling=rasterio.enums.Resampling.bilinear,
        )

        if src.nodata is not None:
            data = np.where(data == src.nodata, np.nan, data)

        data_min = np.nanmin(data)
        data_max = np.nanmax(data)
        if data_max > data_min:
            scaled = ((data - data_min) / (data_max - data_min) * 255).astype(np.uint8)
        else:
            scaled = np.zeros_like(data, dtype=np.uint8)

        img = Image.fromarray(scaled, mode="L")
        img_rgba = Image.new("RGBA", img.size)
        img_rgba.paste(img.convert("RGBA"))
        return img_rgba

@app.get("/info/{filename}")
async def get_file_info(filename: str):
    """Return detailed metadata info about uploaded GeoTIFF"""
    file_path = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    try:
        with rasterio.open(file_path) as src:
            return {
                "filename": filename,
                "driver": src.driver,
                "width": src.width,
                "height": src.height,
                "count": src.count,
                "crs": str(src.crs),
                "transform": list(src.transform),
                "bounds": list(src.bounds),
                "nodata": src.nodata,
                "dtypes": [str(dt) for dt in src.dtypes],
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading file info: {e}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000, reload=True)