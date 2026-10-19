"""
Fine-tune the live detector on lights and the devices Ghost Watt prices.

The stock live model (EfficientDet-Lite0, COCO) has no lamp, light or fan class,
which is why the live view cannot box lights. This script builds a small
detector that has them, from Open Images V7, and exports a .tflite file the app
loads in place of the stock model.

Run it in a free Google Colab notebook with a GPU runtime (Runtime -> Change
runtime type -> T4 GPU). Expect about an hour for download plus training.
It has NOT been run in this repository's build environment, which has no GPU.

    !pip install -q fiftyone mediapipe-model-maker
    !python train-detector.py --per-class 600 --epochs 30

Then put ghost_watt_detector.tflite in the app's public/models/ folder and set,
in Vercel (Settings -> Environment Variables) and .env.local:

    NEXT_PUBLIC_DETECTOR_MODEL_URL=/models/ghost_watt_detector.tflite

and redeploy. The app maps the class names below to its device catalogue
(src/lib/live.ts, COCO_MAP); keep the names as they are.
"""

import argparse
import json
import os
import shutil

import fiftyone as fo
import fiftyone.zoo as foz
from mediapipe_model_maker import object_detector, quantization

# Open Images class -> the label the app expects (src/lib/live.ts).
CLASSES = {
    "Lamp": "lamp",
    "Light bulb": "light bulb",
    "Chandelier": "chandelier",
    "Ceiling fan": "ceiling fan",
    "Television": "tv",
    "Computer monitor": "tv",
    "Laptop": "laptop",
    "Microwave oven": "microwave",
    "Refrigerator": "refrigerator",
    "Oven": "oven",
    "Printer": "printer",
}


def load(split: str, per_class: int) -> fo.Dataset:
    ds = foz.load_zoo_dataset(
        "open-images-v7",
        split=split,
        label_types=["detections"],
        classes=list(CLASSES),
        max_samples=per_class * len(CLASSES),
        dataset_name=f"gw-{split}",
        overwrite=True,
    )
    ds = ds.filter_labels("ground_truth", fo.ViewField("label").is_in(list(CLASSES))).clone()
    ds.map_labels("ground_truth", CLASSES).save()
    return ds


def export_coco(ds: fo.Dataset, out: str, names: list[str]) -> None:
    if os.path.exists(out):
        shutil.rmtree(out)
    ds.export(
        export_dir=out,
        dataset_type=fo.types.COCODetectionDataset,
        label_field="ground_truth",
        classes=names,
        data_path="images",
        labels_path="labels.json",
    )
    # Model Maker wants category ids 1..n with 0 reserved for background.
    path = os.path.join(out, "labels.json")
    data = json.load(open(path))
    remap = {c["id"]: i + 1 for i, c in enumerate(data["categories"])}
    data["categories"] = [{"id": 0, "name": "background"}] + [
        {"id": remap[c["id"]], "name": c["name"]} for c in data["categories"]
    ]
    for a in data["annotations"]:
        a["category_id"] = remap[a["category_id"]]
    json.dump(data, open(path, "w"))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-class", type=int, default=600)
    ap.add_argument("--epochs", type=int, default=30)
    ap.add_argument("--out", default="ghost_watt_detector.tflite")
    args = ap.parse_args()

    names = sorted(set(CLASSES.values()))
    export_coco(load("train", args.per_class), "data/train", names)
    export_coco(load("validation", max(60, args.per_class // 6)), "data/val", names)

    train = object_detector.Dataset.from_coco_folder("data/train", cache_dir="cache/train")
    val = object_detector.Dataset.from_coco_folder("data/val", cache_dir="cache/val")
    options = object_detector.ObjectDetectorOptions(
        supported_model=object_detector.SupportedModels.MOBILENET_MULTI_AVG,
        hparams=object_detector.HParams(epochs=args.epochs, batch_size=16, export_dir="export"),
    )
    model = object_detector.ObjectDetector.create(train_data=train, validation_data=val, options=options)
    loss, coco = model.evaluate(val, batch_size=16)
    print("validation loss", loss)
    print("validation COCO metrics", coco)
    model.export_model(args.out, quantization_config=quantization.QuantizationConfig.for_float16())
    print("wrote", os.path.join("export", args.out))


if __name__ == "__main__":
    main()
