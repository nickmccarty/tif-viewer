# GeoTIFF Viewer

A web-based GeoTIFF viewer built with FastAPI and Leaflet.js that allows you to upload and visualize GeoTIFF files in your browser.

## Features

- **Upload GeoTIFF files** via web interface
- **Interactive map** powered by Leaflet.js
- **Tile-based rendering** for efficient visualization
- **Layer opacity control**
- **File information display** (dimensions, CRS, bounds, etc.)
- **Fit to bounds** functionality
- **Coordinate display** on mouse hover
- **Responsive design** for desktop and mobile

## Installation

1. **Clone or navigate to the project directory:**
   ```bash
   cd tif-viewer
   ```

2. **Create a virtual environment (recommended):**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

## Usage

1. **Start the FastAPI server:**
   ```bash
   python main.py
   ```
   
   Or using uvicorn directly:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 8000 --reload
   ```

2. **Open your browser and navigate to:**
   ```
   http://localhost:8000
   ```

3. **Upload a GeoTIFF file:**
   - Click "Choose File" and select a `.tif` or `.tiff` file
   - Click "Upload GeoTIFF"
   - The file will be processed and displayed on the map

## Project Structure

```
tif-viewer/
├── main.py              # FastAPI application
├── requirements.txt     # Python dependencies
├── README.md           # This file
├── static/             # Static web assets
│   ├── index.html      # Main HTML page
│   ├── style.css       # CSS styles
│   └── app.js          # JavaScript application
└── uploads/            # Directory for uploaded files (created automatically)
```

## API Endpoints

- `GET /` - Serve the main HTML page
- `POST /upload` - Upload a GeoTIFF file
- `GET /tile/{filename}/{z}/{x}/{y}.png` - Generate map tiles
- `GET /info/{filename}` - Get detailed file information

## Technical Details

### Backend (FastAPI)
- **File Upload**: Handles GeoTIFF file uploads with validation
- **Tile Generation**: Creates map tiles on-demand using rasterio
- **Coordinate Transformation**: Supports various CRS with automatic reprojection
- **File Processing**: Extracts metadata and bounds information

### Frontend (Leaflet.js)
- **Interactive Map**: Full-featured mapping interface
- **Tile Layer**: Displays GeoTIFF data as tiled overlay
- **UI Controls**: Opacity slider, layer controls, map navigation
- **File Information**: Displays metadata and properties

### Tile Generation
The application generates tiles using a simplified approach suitable for development and testing. For production use, consider implementing:
- Tile caching for better performance
- Pre-generated tile pyramids
- More sophisticated resampling algorithms
- Support for multi-band imagery

## Supported Formats

- GeoTIFF files (`.tif`, `.tiff`)
- Various coordinate reference systems (CRS)
- Single and multi-band imagery
- Different data types (uint8, uint16, float32, etc.)

## Dependencies

### Python
- **FastAPI**: Web framework
- **Rasterio**: Geospatial raster I/O
- **NumPy**: Numerical computing
- **Pillow**: Image processing
- **PyProj**: Coordinate transformations

### Frontend
- **Leaflet.js**: Interactive mapping library
- **OpenStreetMap**: Base map tiles

## Development

To run in development mode with auto-reload:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## Limitations

- Simplified tile generation (not optimized for large files)
- No persistent storage (files are stored temporarily)
- Basic visualization (single band, grayscale)
- No authentication or user management

## Future Enhancements

- Multi-band RGB visualization
- Histogram equalization and contrast adjustment
- Tile caching and pre-generation
- User authentication and file management
- Support for additional raster formats
- Advanced styling and symbology options
- Export functionality

## License

This project is provided as-is for educational and development purposes.

## Troubleshooting

### Common Issues

1. **"Error processing GeoTIFF"**
   - Ensure the file is a valid GeoTIFF
   - Check that the file has proper georeferencing
   - Verify the coordinate reference system is supported

2. **Tiles not loading**
   - Check browser console for errors
   - Ensure the uploaded file is accessible
   - Verify network connectivity

3. **Poor performance with large files**
   - Consider using smaller files for testing
   - Implement tile caching for production use
   - Use overviews in your GeoTIFF files

### Browser Compatibility

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## Contributing

Feel free to submit issues and enhancement requests!
