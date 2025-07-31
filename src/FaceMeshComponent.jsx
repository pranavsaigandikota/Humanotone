import React, { useRef, useEffect, useCallback } from 'react';
import Webcam from 'react-webcam';
import { FaceMesh } from '@mediapipe/face_mesh';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';

export default function App() {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const faceMeshRef = useRef(null);

  const onResults = useCallback((results) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const video = webcamRef.current.video;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    if (results.multiFaceLandmarks) {
      for (const landmarks of results.multiFaceLandmarks) {
        drawConnectors(ctx, landmarks, FaceMesh.FACEMESH_TESSELATION, {
          color: '#C0C0C070',
          lineWidth: 1,
        });
        drawLandmarks(ctx, landmarks, { color: '#FF3030', lineWidth: 1 });
      }
    }
    ctx.restore();
  }, []);

  useEffect(() => {
    faceMeshRef.current = new FaceMesh({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file.replace('simd', 'wasm')}`,
    });

    faceMeshRef.current.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    faceMeshRef.current.onResults(onResults);

    const camera = webcamRef.current.video;

    let animationFrameId;

    async function runFrame() {
      if (camera.readyState === 4) {
        await faceMeshRef.current.send({ image: camera });
      }
      animationFrameId = requestAnimationFrame(runFrame);
    }
    runFrame();

    return () => {
      cancelAnimationFrame(animationFrameId);
      faceMeshRef.current.close();
    };
  }, [onResults]);

  return (
    <div style={{ position: 'relative', width: 640, height: 480 }}>
      <Webcam
        ref={webcamRef}
        style={{
          position: 'absolute',
          width: 640,
          height: 480,
          transform: 'scaleX(-1)', // mirror webcam horizontally
          visibility: 'hidden', // hide raw webcam
        }}
      />
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          width: 640,
          height: 480,
        }}
      />
    </div>
  );
}
