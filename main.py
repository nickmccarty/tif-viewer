from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, StreamingResponse
import rasterio
from rasterio.warp import calculate_default_transform, reproject, Resampling
from rasterio.crs import CRS
import numpy as np
from PIL import Image
import io
import os
from typing import Optional
import json

app = FastAPI(title="GeoTIFF Viewer", description="A web-based GeoTIFF viewer using Leaflet")

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Store uploaded files temporarily
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@app.get("/", response_class=HTMLResponse)
async def root():
    """Serve the main HTML page"""
    with open("static/index.html", "r") as f:
        return HTMLResponse(content=f.read())

@app.post("/upload")
async def upload_geotiff(file: UploadFile = File(...)):
    """Upload a GeoTIFF file"""
    if not file.filename.lower().endswith(('.tif', '.tiff')):
        raise HTTPException(status_code=400, detail="File must be a GeoTIFF (.tif or .tiff)")
    
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    
    # Save the uploaded file
    with open(file_path, "wb") as buffer:
        content = await file.read()
        buffer.write(content)
    
    # Get basic info about the GeoTIFF
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
            "success": True
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error processing GeoTIFF: {str(e)}")

@app.get("/tile/{filename}/{z}/{x}/{y}.png")
async def get_tile(filename: str, z: int, x: int, y: int):
    """Generate map tiles from GeoTIFF"""
    file_path = os.path.join(UPLOAD_DIR, filename)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    try:
        # This is a simplified tile generation - in production you'd want proper tile caching
        tile_image = generate_tile(file_path, z, x, y)
        
        # Convert to PNG and return
        img_io = io.BytesIO()
        tile_image.save(img_io, 'PNG')
        img_io.seek(0)
        
        return StreamingResponse(img_io, media_type="image/png")
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating tile: {str(e)}")

def generate_tile(file_path: str, z: int, x: int, y: int, tile_size: int = 256):
    """Generate a single tile from GeoTIFF (simplified implementation)"""
    # This is a basic implementation - for production use, consider libraries like rio-tiler
    with rasterio.open(file_path) as src:
        # Get tile bounds in Web Mercator
        tile_bounds = get_tile_bounds(x, y, z)
        
        # Transform to source CRS if needed
        if src.crs != CRS.from_epsg(3857):
            # Reproject tile bounds to source CRS
            from rasterio.warp import transform_bounds
            tile_bounds = transform_bounds(CRS.from_epsg(3857), src.crs, *tile_bounds)
        
        # Read data within tile bounds
        try:
            window = rasterio.windows.from_bounds(*tile_bounds, src.transform)
            data = src.read(1, window=window, out_shape=(tile_size, tile_size))
            
            # Normalize data to 0-255 range
            data_min, data_max = np.nanmin(data), np.nanmax(data)
            if data_max > data_min:
                data = ((data - data_min) / (data_max - data_min) * 255).astype(np.uint8)
            else:
                data = np.zeros_like(data, dtype=np.uint8)
            
            # Create PIL image
            return Image.fromarray(data, mode='L')
            
        except Exception:
            # Return empty tile if out of bounds
            return Image.new('RGBA', (tile_size, tile_size), (0, 0, 0, 0))

def get_tile_bounds(x: int, y: int, z: int):
    """Calculate tile bounds in Web Mercator (EPSG:3857)"""
    n = 2.0 ** z
    lon_deg_min = x / n * 360.0 - 180.0
    lon_deg_max = (x + 1) / n * 360.0 - 180.0
    lat_rad_min = np.arctan(np.sinh(np.pi * (1 - 2 * (y + 1) / n)))
    lat_rad_max = np.arctan(np.sinh(np.pi * (1 - 2 * y / n)))
    
    # Convert to Web Mercator coordinates
    from pyproj import Transformer
    transformer = Transformer.from_crs("EPSG:6859", "EPSG:3857", always_xy=True)
    
    x_min, y_min = transformer.transform(lon_deg_min, np.degrees(lat_rad_min))
    x_max, y_max = transformer.transform(lon_deg_max, np.degrees(lat_rad_max))
    
    return (x_min, y_min, x_max, y_max)

@app.get("/info/{filename}")
async def get_file_info(filename: str):
    """Get detailed information about a GeoTIFF file"""
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
                "dtypes": [str(dtype) for dtype in src.dtypes]
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading file info: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
