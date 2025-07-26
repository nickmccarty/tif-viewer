# main.py
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, StreamingResponse
import rasterio
from rasterio.warp import transform_bounds
from rasterio.windows import from_bounds
from rasterio.crs import CRS
import numpy as np
from PIL import Image
import io
import os
import math
import json
from pyproj import Transformer

app = FastAPI(title="GeoTIFF & GeoJSON Viewer", description="A web-based viewer for GeoTIFF and GeoJSON using Leaflet")

UPLOAD_DIR = "uploads"
GEOJSON_DIR = os.path.join(UPLOAD_DIR, "geojson")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(GEOJSON_DIR, exist_ok=True)

# Serve static assets
app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/geojson", StaticFiles(directory=GEOJSON_DIR), name="geojson")


@app.get("/", response_class=HTMLResponse)
async def root():
    with open("static/index.html", "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())


@app.post("/upload")
async def upload_geotiff(file: UploadFile = File(...)):
    """
    Upload a GeoTIFF file. Response includes projected WGS84 bounds for frontend fit-to-bounds.
    """
    if not file.filename.lower().endswith((".tif", ".tiff")):
        raise HTTPException(status_code=400, detail="File must be a GeoTIFF (.tif or .tiff).")

    file_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_path, "wb") as out:
        out.write(await file.read())

    try:
        with rasterio.open(file_path) as src:
            bounds_src = src.bounds
            crs_src = src.crs
            width = src.width
            height = src.height
            count = src.count
            # Transform bounds to EPSG:4326 for frontend display
            bounds_wgs84 = transform_bounds(
                crs_src, "EPSG:4326",
                bounds_src.left, bounds_src.bottom, bounds_src.right, bounds_src.top
            )
            return {
                "filename": file.filename,
                "bounds": [bounds_wgs84[0], bounds_wgs84[1], bounds_wgs84[2], bounds_wgs84[3]],
                "crs": str(crs_src),
                "width": width,
                "height": height,
                "bands": count,
                "success": True,
            }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error processing GeoTIFF: {e}")


@app.post("/upload_geojson")
async def upload_geojson(file: UploadFile = File(...)):
    if not (file.filename.lower().endswith(".geojson") or file.filename.lower().endswith(".json")):
        raise HTTPException(status_code=400, detail="File must be GeoJSON")

    file_path = os.path.join(GEOJSON_DIR, file.filename)
    content = await file.read()
    geojson_data = json.loads(content)
    feature_count = len(geojson_data.get("features", []))

    # Reproject if .crs is specified and differs from EPSG:4326
    if geojson_data.get("crs"):
        name = geojson_data["crs"]["properties"]["name"]
        # Parse out EPSG code
        import re
        m = re.search(r"EPSG:?(\d+)", name)
        source_crs = m.group(1) if m else "4326"
        if source_crs != "4326":
            transformer = Transformer.from_crs(f"EPSG:{source_crs}", "EPSG:4326", always_xy=True)
            for feature in geojson_data["features"]:
                geom = feature["geometry"]
                typ = geom["type"]
                coords = geom["coordinates"]
                def tx(xs):
                    return [list(transformer.transform(*pt)) for pt in xs]
                if typ == "Polygon":
                    new_coords = [tx(ring) for ring in coords]
                    geom["coordinates"] = new_coords
                elif typ == "MultiPolygon":
                    new_coords = []
                    for polygon in coords:
                        new_coords.append([tx(ring) for ring in polygon])
                    geom["coordinates"] = new_coords
                elif typ == "LineString":
                    geom["coordinates"] = tx(coords)
                elif typ == "MultiLineString":
                    geom["coordinates"] = [tx(line) for line in coords]
                elif typ == "Point":
                    geom["coordinates"] = list(transformer.transform(*coords))
                elif typ == "MultiPoint":
                    geom["coordinates"] = [list(transformer.transform(*pt)) for pt in coords]
            geojson_data.pop("crs", None)

    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(geojson_data, f, indent=2)

    return {"success": True, "filename": file.filename, "url": f"/geojson/{file.filename}", "feature_count": feature_count}


def tile2lon(x, z): return x / (2 ** z) * 360.0 - 180.0
def tile2lat(y, z):
    n = math.pi - 2.0 * math.pi * y / (2 ** z)
    return math.degrees(math.atan(math.sinh(n)))


def get_tile_bounds(x, y, z):
    # WebMercator bounds in meters
    lon_min = tile2lon(x, z)
    lon_max = tile2lon(x + 1, z)
    lat_min = tile2lat(y + 1, z)
    lat_max = tile2lat(y, z)
    return transform_bounds("EPSG:4326", "EPSG:3857", lon_min, lat_min, lon_max, lat_max, densify_pts=21)


@app.get("/tile/{filename}/{z}/{x}/{y}.png")
async def get_tile(filename: str, z: int, x: int, y: int):
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


def generate_tile(file_path, z, x, y, tile_size=256):
    with rasterio.open(file_path) as src:
        tile_bounds_3857 = get_tile_bounds(x, y, z)
        # Reproject tile bounds to raster's CRS, if needed:
        if src.crs != CRS.from_epsg(3857):
            tile_bounds_src_crs = transform_bounds("EPSG:3857", src.crs, *tile_bounds_3857, densify_pts=21)
        else:
            tile_bounds_src_crs = tile_bounds_3857
        window = from_bounds(*tile_bounds_src_crs, transform=src.transform)
        if window.width <= 0 or window.height <= 0:
            return Image.new("RGBA", (tile_size, tile_size), (0, 0, 0, 0))  # Transparent, no-coverage
        arr = src.read(
            1,
            window=window,
            out_shape=(tile_size, tile_size),
            resampling=rasterio.enums.Resampling.bilinear,
        )
        if src.nodata is not None:
            arr = np.where(arr == src.nodata, np.nan, arr)
        # Normalize for display
        data_min = np.nanmin(arr)
        data_max = np.nanmax(arr)
        if data_max > data_min:
            scaled = np.clip(((arr - data_min) / (data_max - data_min)) * 255, 0, 255).astype(np.uint8)
        else:
            scaled = np.zeros_like(arr, dtype=np.uint8)
        img = Image.fromarray(scaled, mode="L")
        img_rgba = img.convert("RGBA")
        return img_rgba


@app.get("/info/{filename}")
async def get_file_info(filename: str):
    file_path = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    try:
        with rasterio.open(file_path) as src:
            bounds_wgs84 = transform_bounds(src.crs, "EPSG:4326", *src.bounds)
            return {
                "filename": filename,
                "driver": src.driver,
                "width": src.width,
                "height": src.height,
                "count": src.count,
                "crs": str(src.crs),
                "transform": list(src.transform),
                "bounds": list(bounds_wgs84),
                "nodata": src.nodata,
                "dtypes": [str(dt) for dt in src.dtypes],
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading file info: {e}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000, reload=True)
