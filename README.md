# AIRFLOW Studio

**Gesture-Controlled Digital Drawing Application**

AIRFLOW Studio is an interactive web-based drawing application that allows users to create digital artwork using natural hand gestures captured through a webcam. By combining real-time hand tracking with an interactive drawing canvas, the application provides a touch-free creative experience where users can draw in the air and see their movements translated into digital artwork.

The application uses MediaPipe for hand landmark detection and gesture recognition, enabling users to interact with drawing tools through hand movements without requiring a mouse, stylus or touchscreen.

## Features

### Gesture-Based Drawing
- Real-time hand tracking through the webcam.
- Draw on the digital canvas using hand gestures.
- Pinch gestures to activate drawing.
- Smooth stroke rendering based on detected hand movements.
- Mirrored hand tracking for intuitive interaction.

### Drawing Tools
- Multiple brush styles and visual effects.
- Neon and rainbow drawing effects.
- Particle-based drawing effects.
- Adjustable brush sizes.
- Custom colour selection.
- Dedicated eraser tool.
- Undo functionality.
- Clear canvas functionality.

### Creative Controls
- Mirror symmetry for creating balanced artwork.
- Interactive drawing controls.
- Real-time visual feedback.
- Export artwork as PNG images.
- Support for transparent background exports.

### Computer Vision
- MediaPipe hand landmark detection.
- Real-time gesture processing.
- Webcam-based interaction.
- Locally hosted MediaPipe WebAssembly files for reliable loading.

## Technology Stack

| Technology | Purpose |
|---|---|
| React | Component-based user interface |
| JavaScript | Application logic and interaction |
| Vite | Development server and build tooling |
| MediaPipe | Hand tracking and landmark detection |
| HTML5 Canvas | Real-time drawing and rendering |
| CSS | Application styling and animations |
| WebAssembly | Efficient execution of MediaPipe vision tasks |
| Lucide React | Interface icons |

## How It Works

AIRFLOW Studio uses computer vision to translate physical hand movements into digital drawing actions.

1. **Camera Initialisation:** The application requests webcam access and initialises the hand tracking system.
2. **Hand Detection:** MediaPipe processes camera frames and identifies hand landmarks.
3. **Gesture Recognition:** The application tracks the index finger and thumb to detect drawing gestures.
4. **Coordinate Mapping:** Detected hand positions are mapped to coordinates on the drawing canvas.
5. **Stroke Rendering:** Hand movements are translated into smooth digital strokes using the HTML5 Canvas API.
6. **Artwork Export:** Users can export their completed drawings as PNG images.

## Getting Started

### Prerequisites

Make sure you have the following installed:

- Node.js
- npm
- A modern web browser
- A webcam

### Installation

Clone the repository:

```bash
git clone https://github.com/Chriscoding19/airflow-studio.git
```

Navigate to the project directory:

```bash
cd airflow-studio
```

Install the dependencies:

```bash
npm install
```

### Run the Application

Start the development server:

```bash
npm run dev
```

To make the application accessible from other devices on your local network:

```bash
npm run dev -- --host 0.0.0.0
```

Open the local development URL displayed in your terminal, usually:

```text
http://localhost:5173/
```

Allow camera access when prompted by your browser.

## Project Structure

```text
airflow-studio/
│
├── public/
│   ├── mediapipe/
│   │   └── wasm/
│   │
│   ├── favicon.svg
│   └── icons.svg
│
├── src/
│   ├── assets/
│   │
│   ├── components/
│   │   ├── BrushPanel.jsx
│   │   ├── CameraView.jsx
│   │   ├── CanvasBoard.jsx
│   │   └── Toolbar.jsx
│   │
│   ├── hooks/
│   │   └── useHandTracking.js
│   │
│   ├── utils/
│   │   ├── drawing.js
│   │   └── handGestures.js
│   │
│   ├── App.css
│   ├── App.jsx
│   ├── index.css
│   └── main.jsx
│
├── index.html
├── package.json
├── package-lock.json
├── vite.config.js
└── README.md
```

## Browser Permissions

AIRFLOW Studio requires webcam access to perform real-time hand tracking.

When prompted, grant camera permission to the browser. Camera access is generally available on localhost during development and on deployed websites served over HTTPS.

## Future Improvements

Potential areas for further development include:

- Voice-controlled drawing commands.
- Integrated music playback.
- Voice-controlled YouTube search.
- Additional gesture recognition capabilities.
- Expanded brush effects and creative tools.
- Improved drawing precision and gesture customisation.
  

## License

This project is available for educational and personal use. A formal open-source licence can be added when the repository's licensing terms are established.
