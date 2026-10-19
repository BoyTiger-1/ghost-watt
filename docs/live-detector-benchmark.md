# Live detector benchmark

How the on-device detector behind the live view was chosen, and how to re-run
the comparison on your own frames.

## Question

The live view needs a detector that runs in the browser at video rate and finds
the powered things a room has: screens, laptops, the appliances the small models
know. Four candidates were measured on the same pictures:

| Candidate | Runtime | Input | Size |
| --- | --- | --- | --- |
| EfficientDet-Lite0 | MediaPipe Tasks (TFLite, WASM/XNNPACK) | 320 px | 7 MB |
| EfficientDet-Lite2 | MediaPipe Tasks | 448 px | 12 MB |
| EfficientDet-Lite0, tiled | the app's photo pipeline: whole frame + 4 zoomed tiles, classifier check | 320 px × 5 | 7 MB + 5 MB classifier |
| YOLOv8n | ONNX Runtime Web (WASM, single thread) | 640 px letterboxed | 13 MB |

## Set

40 photos from the Open Images V5 validation split, chosen because they carry
two or more clean (non-group, non-depiction) boxes of *Computer monitor*,
*Television*, *Laptop*, *Microwave oven* or *Refrigerator*: 37 screens, 25
laptops, 8 microwaves, 2 refrigerators. Open Images "Computer monitor" and
"Television" both map to COCO "tv", which is how every candidate labels a
screen. The pictures are ordinary indoor photos, not phone frames of a
classroom, so the absolute numbers are a comparison between models, not a
promise about any room.

A detection counts when its class matches and it overlaps the labelled box
by IoU ≥ 0.5. Timings are per picture on this build machine's CPU after one
warm-up run (WebGPU here is software-emulated and took 17 s a frame, so it is
not reported; on a phone with a real GPU the MediaPipe GPU delegate is used
when available).

## Result

Score threshold 0.35, the live view's default:

| Model | ms / picture | Recall | Precision | Screens | Laptops | Microwaves | Fridges |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| EfficientDet-Lite0 | 124 | 0.54 | 0.81 | 18/37 | 16/25 | 3/8 | 2/2 |
| EfficientDet-Lite0, tiled (photo pipeline) | 12 562 | 0.57 | 0.84 | 18/37 | 19/25 | 3/8 | 1/2 |
| EfficientDet-Lite2 | 343 | 0.54 | 0.74 | 19/37 | 15/25 | 3/8 | 2/2 |
| YOLOv8n (ORT Web, WASM) | 423 | 0.58 | 0.72 | 17/37 | 20/25 | 3/8 | 2/2 |

At a 0.5 threshold every model trades recall for precision in the same way
(Lite0 0.46 / 0.85, YOLOv8n 0.53 / 0.84).

## What was decided

- **EfficientDet-Lite0 stays as the live candidate finder.** It is the fastest
  by three times, and nothing larger found more screens at the same precision.
  YOLOv8n's extra recall (two laptops) came with twice the false positives.
- **Lite2 is dropped.** No gain over Lite0 on these pictures, three times the
  cost; the app now uses Lite0 on both the GPU and CPU delegates.
- **No small model is good enough to price from.** Roughly half the labelled
  screens went unfound by all four. That is why the live view treats every
  detection as a candidate (dashed, unpriced) and confirms a held-still view
  through the strong path: the cloud model in Enhanced mode, or the tiled
  on-device pipeline otherwise, which has the best precision of the four.
- **The pixel light finder false-positives on stills.** On the 28 pictures
  with no lamp or bulb labelled at all it claimed 32 lit fixtures. Lights found
  on the device are therefore shown as unverified until the user confirms them
  or the cloud model does.

## Pipeline checks

The things that quietly break a ported detector were checked against the same
frames before any tuning: MediaPipe takes the frame element directly (no manual
resize, channel order or normalisation), so those cannot be wrong on its path;
boxes come back in source pixels and are mapped through the `object-fit: cover`
rectangle once; the per-class score floor (0.4 screens, 0.45–0.5 appliances)
and class-wise IoU suppression at 0.45 live in `src/lib/candidates.ts`; the
YOLO path's letterbox, RGB/255 NCHW input and NMS were written out explicitly
in `src/lib/yolo.ts` while it was under test.

## Re-running it

`npm run dev`, open `/bench`, pick your frames (kitchen, office, bedroom), run.
Each detector lists what it found with its confidence and time. The page also
exposes `window.__bench.one(url, [models])` for scripting against a labelled
set; the Open Images run above used Playwright to call it per picture and a
small Python script to match boxes.
