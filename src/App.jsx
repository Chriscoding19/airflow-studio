import { useCallback, useEffect, useRef, useState } from "react";
import {
  Hand,
  Camera,
  CameraOff,
  Download,
  Eraser,
  Undo2,
  Trash2,
  Sparkles,
  Palette,
  Circle,
  Check,
  Maximize2,
  Activity,
  Scan,
  Aperture,
  MousePointer2,
} from "lucide-react";

import "./App.css";

const COLORS = [
  "#10B981",
  "#38BDF8",
  "#A78BFA",
  "#F472B6",
  "#F59E0B",
  "#F8FAFC",
  "#EF4444",
];

const WIDTH = 1200;
const HEIGHT = 700;

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

// MediaPipe's WASM runtime is served locally from /public/mediapipe/wasm.
// This avoids the broken CDN URL and ensures the JS/WASM files use the
// exact same version as the installed @mediapipe/tasks-vision package.
const WASM_URL = "/mediapipe/wasm";

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function drawStroke(ctx, stroke) {
  const points = stroke.points ?? [];
  if (!points.length) return;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalCompositeOperation =
    stroke.tool === "eraser" ? "destination-out" : "source-over";
  ctx.lineWidth = stroke.size ?? 7;

  if (stroke.tool === "neon") {
    ctx.shadowColor = stroke.color;
    ctx.shadowBlur = 18;
  }

  // A fixed gradient keeps rainbow strokes stable when the canvas redraws.
  if (stroke.tool === "rainbow") {
    const first = points[0];
    const last = points[points.length - 1];

    const startX = first.x * WIDTH;
    const startY = first.y * HEIGHT;
    let endX = last.x * WIDTH;
    let endY = last.y * HEIGHT;

    // Canvas gradients need a non-zero length.
    if (startX === endX && startY === endY) {
      endX += 1;
      endY += 1;
    }

    const gradient = ctx.createLinearGradient(
      startX,
      startY,
      endX,
      endY
    );

    gradient.addColorStop(0, "#ff3b6b");
    gradient.addColorStop(0.2, "#ff9f1c");
    gradient.addColorStop(0.4, "#ffe66d");
    gradient.addColorStop(0.6, "#2ee59d");
    gradient.addColorStop(0.8, "#38bdf8");
    gradient.addColorStop(1, "#a78bfa");

    ctx.strokeStyle = gradient;
    ctx.fillStyle = gradient;
  } else {
    ctx.strokeStyle =
      stroke.tool === "eraser" ? "#000000" : stroke.color;
    ctx.fillStyle =
      stroke.tool === "eraser" ? "#000000" : stroke.color;
  }

  if (stroke.tool === "particle") {
    // Deterministic particle sizes prevent flickering on every redraw.
    for (let i = 0; i < points.length; i += 3) {
      const point = points[i];
      const variation = 0.25 + ((i * 17 + 11) % 55) / 100;
      const radius = (stroke.size ?? 7) * variation;

      ctx.globalAlpha = 0.65 + ((i * 13) % 35) / 100;
      ctx.beginPath();
      ctx.arc(
        point.x * WIDTH,
        point.y * HEIGHT,
        radius,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    ctx.restore();
    return;
  }

  if (points.length === 1) {
    ctx.beginPath();
    ctx.arc(
      points[0].x * WIDTH,
      points[0].y * HEIGHT,
      (stroke.size ?? 7) / 2,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.restore();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(points[0].x * WIDTH, points[0].y * HEIGHT);

  for (let i = 1; i < points.length - 1; i++) {
    const current = points[i];
    const next = points[i + 1];

    ctx.quadraticCurveTo(
      current.x * WIDTH,
      current.y * HEIGHT,
      ((current.x + next.x) / 2) * WIDTH,
      ((current.y + next.y) / 2) * HEIGHT
    );
  }

  const last = points[points.length - 1];
  ctx.lineTo(last.x * WIDTH, last.y * HEIGHT);
  ctx.stroke();
  ctx.restore();
}

function drawStrokes(ctx, strokes, symmetry = false) {
  strokes.forEach((stroke) => drawStroke(ctx, stroke));

  // Mirror the complete drawing at render time. Original points are never
  // modified, so symmetry cannot duplicate points in the stroke data.
  if (symmetry) {
    ctx.save();
    ctx.translate(WIDTH, 0);
    ctx.scale(-1, 1);
    strokes.forEach((stroke) => drawStroke(ctx, stroke));
    ctx.restore();
  }
}

function renderStrokes(canvas, strokes, symmetry = false) {
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  drawStrokes(ctx, strokes, symmetry);
}

function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const previewCanvasRef = useRef(null);

  const landmarkerRef = useRef(null);
  const streamRef = useRef(null);

  const animationRef = useRef(null);
  const lastVideoTimeRef = useRef(-1);

  const strokesRef = useRef([]);
  const currentStrokeRef = useRef(null);

  const lastPointRef = useRef(null);
  const isDrawingRef = useRef(false);

  const [cameraActive, setCameraActive] = useState(false);
  const [loadingCamera, setLoadingCamera] = useState(false);
  const [error, setError] = useState("");

  const [tool, setTool] = useState("neon");
  const [color, setColor] = useState(COLORS[0]);
  const [brushSize, setBrushSize] = useState(7);

  const [strokes, setStrokes] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [handDetected, setHandDetected] = useState(false);

  const [symmetry, setSymmetry] = useState(false);
  const [transparent, setTransparent] = useState(false);

  const [status, setStatus] = useState("Camera offline");

  const syncStrokes = useCallback(() => {
    const next = [...strokesRef.current];
    setStrokes(next);
    renderStrokes(canvasRef.current, next, symmetry);
  }, [symmetry]);

  const stopDrawing = useCallback(() => {
    if (currentStrokeRef.current) {
      currentStrokeRef.current = null;
      syncStrokes();
    }

    isDrawingRef.current = false;
    lastPointRef.current = null;
    setIsDrawing(false);
  }, [syncStrokes]);

  const addPoint = useCallback(
    (point) => {
      if (!currentStrokeRef.current) {
        currentStrokeRef.current = {
          color,
          size: brushSize,
          tool,
          points: [point],
        };

        strokesRef.current.push(currentStrokeRef.current);
      } else {
        currentStrokeRef.current.points.push(point);
      }

      renderStrokes(
        canvasRef.current,
        strokesRef.current,
        symmetry
      );
    },
    [color, brushSize, tool, symmetry]
  );

  const drawPreview = useCallback((landmarks, drawing) => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!landmarks) return;

    const finger = landmarks[8];
    const x = (1 - finger.x) * canvas.width;
    const y = finger.y * canvas.height;

    ctx.beginPath();
    ctx.arc(x, y, drawing ? 12 : 8, 0, Math.PI * 2);
    ctx.fillStyle = drawing ? "#10B981" : "#A78BFA";
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 20;
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();
  }, []);

  const processFrame = useCallback(() => {
    const video = videoRef.current;
    const landmarker = landmarkerRef.current;

    if (!video || !landmarker || video.readyState < 2) {
      animationRef.current = requestAnimationFrame(processFrame);
      return;
    }

    if (video.currentTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = video.currentTime;

      try {
        const result = landmarker.detectForVideo(
          video,
          performance.now()
        );

        const landmarks = result.landmarks?.[0] ?? null;

        setHandDetected(Boolean(landmarks));
        drawPreview(landmarks, isDrawingRef.current);

        if (!landmarks) {
          stopDrawing();
          setStatus("Show your hand to the camera");
        } else {
          const index = landmarks[8];
          const thumb = landmarks[4];
          const pinchDistance = distance(index, thumb);
          const pinching = pinchDistance < 0.055;

          const point = {
            x: Math.max(0, Math.min(1, 1 - index.x)),
            y: Math.max(0, Math.min(1, index.y)),
          };

          if (pinching) {
            if (!isDrawingRef.current) {
              isDrawingRef.current = true;
              setIsDrawing(true);
              setStatus(tool === "eraser" ? "Erasing" : "Drawing in the air");

              currentStrokeRef.current = {
                color: tool === "eraser" ? "#000000" : color,
                size: tool === "eraser" ? brushSize * 3 : brushSize,
                tool,
                points: [point],
              };

              strokesRef.current.push(currentStrokeRef.current);
              renderStrokes(
                canvasRef.current,
                strokesRef.current,
                symmetry
              );
            } else {
              const last = lastPointRef.current;

              if (last) {
                const movement = distance(last, point);
                const steps = Math.max(
                  1,
                  Math.ceil(movement / 0.004)
                );

                for (let i = 1; i <= steps; i++) {
                  const t = i / steps;
                  addPoint({
                    x: last.x + (point.x - last.x) * t,
                    y: last.y + (point.y - last.y) * t,
                  });
                }
              } else {
                addPoint(point);
              }
            }

            lastPointRef.current = point;
          } else {
            stopDrawing();
            setStatus("Pinch your fingers to draw");
          }
        }
      } catch (frameError) {
        console.error("MediaPipe frame processing failed:", frameError);
        setError(
          `Hand tracking error: ${frameError.message || "Unable to process camera frame."}`
        );
        setStatus("Hand tracking error");
        stopDrawing();
      }
    }

    animationRef.current = requestAnimationFrame(processFrame);
  }, [
    addPoint,
    brushSize,
    color,
    drawPreview,
    stopDrawing,
    symmetry,
    tool,
  ]);

  const startCamera = async () => {
    try {
      setError("");
      setLoadingCamera(true);
      setStatus("Starting camera...");

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          "Camera access is unavailable. Use localhost or HTTPS and check browser permissions."
        );
      }

      // Start the camera first so permission/device errors are reported clearly.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) {
        throw new Error("Camera preview element was not found.");
      }

      video.srcObject = stream;
      await video.play();

      setStatus("Loading hand-tracking engine...");

      const vision = await import("@mediapipe/tasks-vision");

      // Load the WASM runtime from public/mediapipe/wasm instead of jsDelivr.
      const fileset = await vision.FilesetResolver.forVisionTasks(
        WASM_URL
      );

      const options = {
        runningMode: "VIDEO",
        numHands: 1,
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.6,
        minTrackingConfidence: 0.6,
      };

      let landmarker;

      // Prefer GPU acceleration, but fall back to CPU if the browser/device
      // cannot initialise the GPU delegate.
      try {
        landmarker = await vision.HandLandmarker.createFromOptions(
          fileset,
          {
            ...options,
            baseOptions: {
              modelAssetPath: MODEL_URL,
              delegate: "GPU",
            },
          }
        );
      } catch (gpuError) {
        console.warn(
          "MediaPipe GPU delegate unavailable; falling back to CPU:",
          gpuError
        );

        landmarker = await vision.HandLandmarker.createFromOptions(
          fileset,
          {
            ...options,
            baseOptions: {
              modelAssetPath: MODEL_URL,
              delegate: "CPU",
            },
          }
        );
      }

      landmarkerRef.current = landmarker;
      lastVideoTimeRef.current = -1;

      setCameraActive(true);
      setLoadingCamera(false);
      setStatus("Camera connected");

      animationRef.current = requestAnimationFrame(processFrame);
    } catch (err) {
      console.error("AIRFLOW Studio camera startup failed:", err);

      landmarkerRef.current?.close();
      landmarkerRef.current = null;

      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }

      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;

      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      }

      setCameraActive(false);
      setError(
        err?.message
          ? `Unable to start camera: ${err.message}`
          : "Unable to start camera. Check camera permissions and the MediaPipe runtime files."
      );
      setLoadingCamera(false);
      setStatus("Camera unavailable");
    }
  };

  const stopCamera = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    stopDrawing();

    landmarkerRef.current?.close();
    landmarkerRef.current = null;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }

    setCameraActive(false);
    setHandDetected(false);
    setStatus("Camera offline");

    const preview = previewCanvasRef.current;
    if (preview) {
      const ctx = preview.getContext("2d");
      ctx?.clearRect(0, 0, preview.width, preview.height);
    }
  }, [stopDrawing]);

  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }

      landmarkerRef.current?.close();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    renderStrokes(canvasRef.current, strokes, symmetry);
  }, [strokes, symmetry]);

  const undo = () => {
    strokesRef.current.pop();
    currentStrokeRef.current = null;
    isDrawingRef.current = false;
    lastPointRef.current = null;
    setIsDrawing(false);
    syncStrokes();
  };

  const clearCanvas = () => {
    strokesRef.current = [];
    currentStrokeRef.current = null;
    isDrawingRef.current = false;
    lastPointRef.current = null;
    setIsDrawing(false);
    syncStrokes();
  };

  const exportPNG = () => {
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = WIDTH;
    exportCanvas.height = HEIGHT;

    const ctx = exportCanvas.getContext("2d");
    if (!ctx) return;

    if (!transparent) {
      ctx.fillStyle = "#080b10";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }

    drawStrokes(ctx, strokesRef.current, symmetry);

    const link = document.createElement("a");
    link.download = `airflow-art-${Date.now()}.png`;
    link.href = exportCanvas.toDataURL("image/png");
    link.click();
  };

  const toggleSymmetry = () => {
    setSymmetry((current) => !current);
  };

  return (
    <div className="studio">
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">
            <Aperture size={23} />
          </div>

          <div>
            <h1>
              AIRFLOW<span>STUDIO</span>
            </h1>
            <p>GESTURE-POWERED CREATIVE SPACE</p>
          </div>
        </div>

        <div className="topbar-right">
          <div className="live-indicator">
            <span
              className={
                cameraActive ? "live-dot active" : "live-dot"
              }
            />
            {cameraActive ? "CAMERA LIVE" : "STANDBY"}
          </div>

          <button
            className="icon-button"
            onClick={exportPNG}
            title="Export PNG"
          >
            <Download size={18} />
          </button>
        </div>
      </header>

      <main className="workspace">
        <section className="welcome">
          <div>
            <div className="eyebrow">
              <Sparkles size={14} />
              DIGITAL ART, REIMAGINED
            </div>

            <h2>
              Draw beyond
              <span> the screen.</span>
            </h2>

            <p>
              Turn your hand movements into digital art.
              No touch. Just imagination.
            </p>
          </div>

          <div className="session-info">
            <div className="session-number">01</div>
            <div>
              <strong>CREATIVE SESSION</strong>
              <span>Real-time hand tracking</span>
            </div>
          </div>
        </section>

        <section className="studio-grid">
          <div className="canvas-panel">
            <div className="panel-header">
              <div className="panel-title">
                <Circle
                  size={10}
                  fill="#10B981"
                  color="#10B981"
                />
                <span>ARTBOARD</span>
                <span className="resolution">1200 × 700</span>
              </div>

              <div className="canvas-actions">
                <button
                  className="small-button"
                  onClick={undo}
                  title="Undo"
                >
                  <Undo2 size={16} />
                </button>

                <button
                  className="small-button"
                  onClick={clearCanvas}
                  title="Clear canvas"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            <div className="canvas-wrapper">
              <div className="canvas-background">
                <div className="canvas-grid" />

                <canvas
                  ref={canvasRef}
                  width={WIDTH}
                  height={HEIGHT}
                  className="drawing-canvas"
                />

                {!strokes.length && (
                  <div className="canvas-empty">
                    <div className="empty-icon">
                      <MousePointer2 size={30} />
                    </div>

                    <h3>Your canvas awaits.</h3>

                    <p>
                      Start the camera and pinch your
                      thumb and index finger to draw.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="canvas-footer">
              <div className="drawing-status">
                <span
                  className={
                    isDrawing ? "status-dot drawing" : "status-dot"
                  }
                />
                {isDrawing
                  ? "DRAWING IN PROGRESS"
                  : "READY TO CREATE"}
              </div>

              <div className="canvas-footer-right">
                <span>{strokes.length} strokes</span>

                <button
                  className="export-button"
                  onClick={exportPNG}
                >
                  <Download size={15} />
                  Export PNG
                </button>
              </div>
            </div>
          </div>

          <aside className="control-panel">
            <div className="control-section">
              <div className="section-heading">
                <Camera size={17} />
                <span>CAMERA TRACKING</span>
              </div>

              <div className="camera-preview">
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                />

                <canvas
                  ref={previewCanvasRef}
                  width={480}
                  height={270}
                  className="preview-overlay"
                />

                {!cameraActive && (
                  <div className="camera-placeholder">
                    <div className="camera-placeholder-icon">
                      <Camera size={27} />
                    </div>

                    <span>Camera preview</span>
                    <small>Your hand appears here</small>
                  </div>
                )}

                <div className="camera-badge">
                  <span
                    className={
                      handDetected
                        ? "camera-dot detected"
                        : "camera-dot"
                    }
                  />
                  {handDetected ? "HAND DETECTED" : "SEARCHING"}
                </div>
              </div>

              <div className="camera-status">
                <div className="status-label">
                  <Activity size={14} />
                  <span>{status}</span>
                </div>

                <button
                  className={
                    cameraActive
                      ? "camera-button stop"
                      : "camera-button"
                  }
                  onClick={cameraActive ? stopCamera : startCamera}
                  disabled={loadingCamera}
                >
                  {loadingCamera ? (
                    <span className="spinner" />
                  ) : cameraActive ? (
                    <CameraOff size={16} />
                  ) : (
                    <Camera size={16} />
                  )}

                  {loadingCamera
                    ? "Connecting..."
                    : cameraActive
                      ? "Stop Camera"
                      : "Start Camera"}
                </button>
              </div>

              {error && <div className="error-message">{error}</div>}
            </div>

            <div className="control-section">
              <div className="section-heading">
                <Palette size={17} />
                <span>BRUSH STUDIO</span>
              </div>

              <div className="brush-modes">
                {[
                  { id: "neon", name: "Neon", icon: Sparkles },
                  { id: "rainbow", name: "Rainbow", icon: Palette },
                  { id: "particle", name: "Particles", icon: Aperture },
                  { id: "eraser", name: "Eraser", icon: Eraser },
                ].map((item) => {
                  const Icon = item.icon;

                  return (
                    <button
                      key={item.id}
                      className={
                        tool === item.id
                          ? "brush-mode selected"
                          : "brush-mode"
                      }
                      onClick={() => {
                        stopDrawing();
                        setTool(item.id);
                      }}
                    >
                      <Icon size={17} />
                      <span>{item.name}</span>
                    </button>
                  );
                })}
              </div>

              <div className="color-heading">
                <span>COLOR PALETTE</span>
                <span>{color.toUpperCase()}</span>
              </div>

              <div className="color-palette">
                {COLORS.map((item) => (
                  <button
                    key={item}
                    className={
                      color === item
                        ? "color-swatch selected"
                        : "color-swatch"
                    }
                    style={{ "--swatch-color": item }}
                    onClick={() => setColor(item)}
                    title={item}
                  >
                    {color === item && <Check size={14} />}
                  </button>
                ))}
              </div>

              <div className="brush-size-heading">
                <span>BRUSH SIZE</span>
                <span>{brushSize}px</span>
              </div>

              <input
                className="brush-slider"
                type="range"
                min="2"
                max="30"
                value={brushSize}
                onChange={(event) =>
                  setBrushSize(Number(event.target.value))
                }
              />
            </div>

            <div className="control-section">
              <div className="section-heading">
                <Scan size={17} />
                <span>CANVAS SETTINGS</span>
              </div>

              <button
                className={
                  symmetry ? "setting-row enabled" : "setting-row"
                }
                onClick={toggleSymmetry}
              >
                <div className="setting-icon">
                  <Maximize2 size={16} />
                </div>

                <div className="setting-copy">
                  <strong>Mirror symmetry</strong>
                  <span>Reflect your strokes</span>
                </div>

                <div className={symmetry ? "toggle on" : "toggle"}>
                  <span />
                </div>
              </button>

              <button
                className={
                  transparent ? "setting-row enabled" : "setting-row"
                }
                onClick={() => setTransparent((value) => !value)}
              >
                <div className="setting-icon">
                  <Circle size={16} />
                </div>

                <div className="setting-copy">
                  <strong>Transparent export</strong>
                  <span>PNG without background</span>
                </div>

                <div className={transparent ? "toggle on" : "toggle"}>
                  <span />
                </div>
              </button>
            </div>

            <div className="gesture-card">
              <div className="gesture-card-top">
                <Hand size={18} />
                <span>GESTURE GUIDE</span>
              </div>

              <div className="gesture-row">
                <div className="gesture-symbol">🤏</div>
                <div>
                  <strong>Pinch to draw</strong>
                  <span>Touch thumb and index finger</span>
                </div>
              </div>

              <div className="gesture-row">
                <div className="gesture-symbol">🖐️</div>
                <div>
                  <strong>Release to pause</strong>
                  <span>Separate fingers to stop</span>
                </div>
              </div>
            </div>
          </aside>
        </section>

        <footer className="studio-footer">
          <div>
            <span className="footer-logo">AIRFLOW</span>
            <span>A new dimension of creativity.</span>
          </div>

          <span>BUILT WITH MEDIAPIPE · REACT · CANVAS</span>
        </footer>
      </main>
    </div>
  );
}

export default App;
