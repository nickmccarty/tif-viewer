from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, StreamingResponse
import rasterio
<<<<<<< HEAD
from rasterio.warp import transform_bounds
=======
from rasterio.warp import calculate_default_transform, reproject, Resampling
>>>>>>> origin/main
from rasterio.crs import CRS
import numpy as np
from PIL import Image
import io
import os
<<<<<<< HEAD
import math

app = FastAPI(title="GeoTIFF Viewer", description="A web-based GeoTIFF viewer using Leaflet")

# Directory to store uploaded GeoTIFF files
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Mount static files (HTML, JS, CSS)
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/", response_class=HTMLResponse)
async def root():
    """Serve main HTML page"""
    with open("static/index.html", "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())


@app.post("/upload")
async def upload_geotiff(file: UploadFile = File(...)):
    """Handle GeoTIFF file upload"""
    if not file.filename.lower().endswith((".tif", ".tiff")):
        raise HTTPException(status_code=400, detail="File must be a GeoTIFF (.tif or .tiff)")

    file_path = os.path.join(UPLOAD_DIR, file.filename)

    # Save file
    with open(file_path, "wb") as buffer:
        content = await file.read()
        buffer.write(content)

=======
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
>>>>>>> origin/main
    try:
        with rasterio.open(file_path) as src:
            bounds = src.bounds
            crs = src.crs
            width = src.width
            height = src.height
            count = src.count
<<<<<<< HEAD

            return {
                "filename": file.filename,
                "bounds": [bounds.left, bounds.bottom, bounds.right, bounds.top],  # [west, south, east, north]
                "crs": str(crs),
                "width": width,
                "height": height,
                "bands": count,
                "success": True,
            }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error processing GeoTIFF: {e}")


@app.get("/tile/{filename}/{z}/{x}/{y}.png")
async def get_tile(filename: str, z: int, x: int, y: int):
    """Generate tile image for given z/x/y from uploaded GeoTIFF"""
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


def tile2lon(x: int, z: int) -> float:
    """Convert tile x at zoom z to longitude in degrees"""
    return x / (2 ** z) * 360.0 - 180.0


def tile2lat(y: int, z: int) -> float:
    """Convert tile y at zoom z to latitude in degrees"""
    n = math.pi - (2.0 * math.pi * y) / (2 ** z)
    return math.degrees(math.atan(math.sinh(n)))


def get_tile_bounds(x: int, y: int, z: int):
    """
    Calculate Web Mercator bounding box (in EPSG:3857) for tile z/x/y.

    Process:
      - Convert tile x/y/z to lon/lat bounds in EPSG:4326
      - Transform lon/lat bounding box to EPSG:3857 for rasterio window extraction
    """
    lon_min = tile2lon(x, z)
    lon_max = tile2lon(x + 1, z)
    lat_min = tile2lat(y + 1, z)
    lat_max = tile2lat(y, z)

    # Transform bounding box from EPSG:4326 to EPSG:3857 (Web Mercator)
    merc_bounds = transform_bounds("EPSG:4326", "EPSG:3857", lon_min, lat_min, lon_max, lat_max)
    return merc_bounds  # (x_min, y_min, x_max, y_max)


def generate_tile(file_path: str, z: int, x: int, y: int, tile_size: int = 256) -> Image.Image:
    """
    Read a tile-sized window from the GeoTIFF matching the tile z/x/y,
    render it as an 8-bit grayscale PNG image.

    Returns a transparent PNG tile if window is outside raster bounds.
    """
    with rasterio.open(file_path) as src:
        # Get tile bounds in Web Mercator (EPSG:3857)
        tile_bounds_3857 = get_tile_bounds(x, y, z)

        # If GeoTIFF CRS not Web Mercator, transform tile bounds to GeoTIFF CRS
        if src.crs != CRS.from_epsg(3857):
            tile_bounds_src_crs = transform_bounds(
                "EPSG:3857", src.crs, *tile_bounds_3857, densify_pts=21
            )
        else:
            tile_bounds_src_crs = tile_bounds_3857

        # Compute window to read from rasterio source dataset
        try:
            window = rasterio.windows.from_bounds(*tile_bounds_src_crs, transform=src.transform)
            if window.width <= 0 or window.height <= 0:
                # Empty window outside raster
                return Image.new("RGBA", (tile_size, tile_size), (0, 0, 0, 0))

            # Read first band data for the tile window
            data = src.read(
                1,
                window=window,
                out_shape=(tile_size, tile_size),
                resampling=rasterio.enums.Resampling.bilinear,
            )

            # Handle nodata (optional) - mask nodata for transparency or black
            if src.nodata is not None:
                mask = data == src.nodata
                data = np.where(mask, np.nan, data)

            # Normalize data to 0-255 grayscale for display
            data_min = np.nanmin(data)
            data_max = np.nanmax(data)
            if data_max > data_min:
                scaled = ((data - data_min) / (data_max - data_min) * 255).astype(np.uint8)
            else:
                scaled = np.zeros(data.shape, dtype=np.uint8)

            # Convert to PIL image in grayscale mode
            img = Image.fromarray(scaled, mode="L")

            # Optionally convert grayscale to RGBA with transparency if desired
            img_rgba = Image.new("RGBA", img.size)
            img_rgba.paste(img.convert("RGBA"))

            return img_rgba
        except Exception:
            # Return transparent tile on error/out-of-bounds
            return Image.new("RGBA", (tile_size, tile_size), (0, 0, 0, 0))


@app.get("/info/{filename}")
async def get_file_info(filename: str):
    """Return detailed metadata info about GeoTIFF"""
    file_path = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")

=======
            
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
    
>>>>>>> origin/main
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
<<<<<<< HEAD
                "dtypes": [str(dtype) for dtype in src.dtypes],
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading file info: {e}")


if __name__ == "__main__":
    import uvicorn

=======
                "dtypes": [str(dtype) for dtype in src.dtypes]
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading file info: {str(e)}")

if __name__ == "__main__":
    import uvicorn
>>>>>>> origin/main
    uvicorn.run(app, host="127.0.0.1", port=8000)
