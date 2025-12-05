import os
import json
import pandas as pd
import numpy as np

from django.conf import settings
from django.http import JsonResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from joblib import dump, load as joblib_load

from sklearn.preprocessing import LabelEncoder
from sklearn.model_selection import cross_val_score, StratifiedKFold

from sklearn.svm import SVC
from sklearn.ensemble import RandomForestClassifier
from sklearn.naive_bayes import GaussianNB
from sklearn.neighbors import KNeighborsClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.tree import DecisionTreeClassifier

from .models import SymptomDisease


# -------------------------------------------------------------------
# Paths
# -------------------------------------------------------------------
BASE_DIR = settings.BASE_DIR
APP_DIR = os.path.join(BASE_DIR, "DiseasePredictor")

TRAIN_CSV_PATH = os.path.join(APP_DIR, "Training.csv")
MODEL_PATH = os.path.join(APP_DIR, "model.pkl")
COLS_PATH = os.path.join(APP_DIR, "columns.pkl")
LE_PATH = os.path.join(APP_DIR, "label_encoder.pkl")
LAST_SCORES_PATH = os.path.join(APP_DIR, "last_scores.pkl")

SUBSYM_PATH = os.path.join(BASE_DIR, "data", "subsymptoms.json")


# -------------------------------------------------------------------
# API ROOT
# -------------------------------------------------------------------
@api_view(["GET"])
@permission_classes([AllowAny])
def api_root(request):
    base = request.build_absolute_uri(request.path)
    return Response({
        "insertpd": base + "insertpd/",
        "train": base + "train/",
        "predict": base + "predict/",
        "symptoms": base + "symptoms/",
        "scores": base + "scores/",
        "subsymptoms": base + "subsymptoms/",
    })


# -------------------------------------------------------------------
# INSERT CSV INTO DATABASE
# -------------------------------------------------------------------
@api_view(["POST"])
@permission_classes([AllowAny])
def insertpd(request):

    if not os.path.exists(TRAIN_CSV_PATH):
        return JsonResponse({"detail": "Training.csv not found."}, status=400)

    try:
        df = pd.read_csv(TRAIN_CSV_PATH)
    except Exception as e:
        return JsonResponse({"detail": f"CSV read error: {str(e)}"}, status=500)

    if "prognosis" not in df.columns:
        return JsonResponse({"detail": "CSV must contain prognosis column."}, status=400)

    SymptomDisease.objects.all().delete()

    inserted = 0
    for _, row in df.iterrows():
        prog = row["prognosis"]
        raw = {c: row[c] for c in df.columns if c != "prognosis"}
        SymptomDisease.objects.create(prognosis=prog, raw=raw)
        inserted += 1

    return JsonResponse({"inserted": inserted})


# -------------------------------------------------------------------
# TRAIN MODEL
# -------------------------------------------------------------------
@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def train(request):

    if not os.path.exists(TRAIN_CSV_PATH):
        return JsonResponse({"detail": "Training.csv not found."}, status=400)

    try:
        df = pd.read_csv(TRAIN_CSV_PATH)
    except Exception as e:
        return JsonResponse({"detail": str(e)}, status=500)

    if "prognosis" not in df.columns:
        return JsonResponse({"detail": "CSV must contain prognosis column."}, status=400)

    feature_cols = [c for c in df.columns if c != "prognosis"]
    X = df[feature_cols].copy()
    y = df["prognosis"]

    # convert to numeric
    for col in X.columns:
        try:
            X[col] = pd.to_numeric(X[col])
        except:
            pass

    X = X.replace({"yes": 1, "no": 0, True: 1, False: 0})

    # encode strings
    non_numeric = X.select_dtypes(include=["object"]).columns.tolist()
    if non_numeric:
        X = pd.get_dummies(X, columns=non_numeric)

    le = LabelEncoder()
    y_enc = le.fit_transform(y)

    # noise
    X_noisy = X.copy().astype(float).to_numpy()
    n_samples, n_features = X_noisy.shape

    rng = np.random.default_rng(42)
    noise_fraction = 0.03
    n_noisy = int(noise_fraction * n_samples * n_features)

    rows = rng.integers(0, n_samples, size=n_noisy)
    cols = rng.integers(0, n_features, size=n_noisy)

    for r, c in zip(rows, cols):
        v = X_noisy[r, c]
        if v in (0, 1):
            X_noisy[r, c] = 1 - v
        else:
            X_noisy[r, c] = v + rng.normal(0, 0.2)

    X_noisy = pd.DataFrame(X_noisy, columns=X.columns)

    models = {
        "svm_rbf": lambda: SVC(probability=True, kernel="rbf", C=1.0, gamma="scale", random_state=42),
        "random_forest": lambda: RandomForestClassifier(
            n_estimators=200, random_state=42, n_jobs=-1, max_depth=20, min_samples_leaf=2
        ),
        "naive_bayes": lambda: GaussianNB(),
        "knn": lambda: KNeighborsClassifier(n_neighbors=5, weights="distance"),
        "logistic_regression": lambda: LogisticRegression(max_iter=1000, C=1.0, solver="lbfgs"),
        "decision_tree": lambda: DecisionTreeClassifier(random_state=42, max_depth=20, min_samples_leaf=2),
    }

    accuracies = {}
    best_name = None
    best_score = -1

    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)

    for name, make_model in models.items():
        model = make_model()
        scores = cross_val_score(model, X_noisy, y_enc, cv=skf)
        avg = scores.mean()
        accuracies[name] = float(avg)
        if avg > best_score:
            best_score = avg
            best_name = name

    best_model = models[best_name]()
    best_model.fit(X_noisy, y_enc)

    # compute training accuracy to compare with cross_val_score
    training_accuracy = float(best_model.score(X_noisy, y_enc))
    overfitting = training_accuracy - float(best_score) > 0.1
    generalization_gap = round(training_accuracy - float(best_score), 4)
    note = "Potential overfitting" if overfitting else "Fit looks reasonable"

    dump(best_model, MODEL_PATH)
    dump(list(X_noisy.columns), COLS_PATH)
    dump(le, LE_PATH)
    dump({
        "best_model": best_name,
        "accuracies": accuracies,
        "training_accuracy": training_accuracy,
        "best_accuracy": float(best_score),
        "generalization_gap": generalization_gap,
        "overfitting": overfitting,
        "note": note
    }, LAST_SCORES_PATH)

    return JsonResponse({
        "status": "trained",
        "best_model": best_name,
        "best_accuracy": float(best_score),
        "training_accuracy": training_accuracy,
        "generalization_gap": generalization_gap,
        "overfitting": overfitting,
        "note": note,
        "accuracies": accuracies,
    })


# -------------------------------------------------------------------
# PREDICT WITH TESTS + MEDICINES + EMERGENCY
# -------------------------------------------------------------------
@api_view(["POST"])
@permission_classes([AllowAny])
def predict(request):

    body = request.data
    symptoms = body.get("symptoms", None)

    if symptoms is None:
        return JsonResponse({"detail": "Provide symptoms list."}, status=400)

    if not (os.path.exists(MODEL_PATH) and os.path.exists(COLS_PATH) and os.path.exists(LE_PATH)):
        return JsonResponse({"detail": "Model missing. Train first."}, status=400)

    clf = joblib_load(MODEL_PATH)
    cols = joblib_load(COLS_PATH)
    le = joblib_load(LE_PATH)

    # build vector
    row = {c: 0 for c in cols}
    sym_set = {str(s).lower().strip() for s in symptoms if s}
    col_map = {c.lower(): c for c in cols}

    for s in sym_set:
        if s in col_map:
            row[col_map[s]] = 1
        elif s.replace(" ", "_") in col_map:
            row[col_map[s.replace(" ", "_")]] = 1

    X_in = pd.DataFrame([row], columns=cols)

    probs = clf.predict_proba(X_in)[0]
    top = probs.argsort()[::-1][:5]

    # ---- load metadata from Training.csv ----
    meta_map = {}
    try:
        df = pd.read_csv(TRAIN_CSV_PATH)
        for _, r in df.iterrows():
            d = str(r["prognosis"]).strip().lower()
            meta_map[d] = {
                "tests": [t.strip() for t in str(r.get("tests","")).split("|") if t.strip()],
                "medicines": [m.strip() for m in str(r.get("medicines","")).split("|") if m.strip()],
                "emergency": bool(int(r.get("emergency",0))),
            }
    except:
        pass

    results = []
    agg_tests = set()
    agg_meds = set()
    emergency_flag = False
    emergency_reasons = []

    for idx in top:
        disease = le.inverse_transform([idx])[0]
        prob = float(probs[idx])

        meta = meta_map.get(disease.lower(), {"tests": [], "medicines": [], "emergency": False})

        if meta["emergency"]:
            emergency_flag = True
            emergency_reasons.append(disease)

        agg_tests.update(meta["tests"])
        agg_meds.update(meta["medicines"])

        results.append({
            "disease": disease,
            "prob": prob,
            "tests": meta["tests"],
            "medicines": meta["medicines"],
            "emergency": meta["emergency"],
        })

    return JsonResponse({
        "predictions": results,
        "agg_tests": list(agg_tests),
        "agg_medicines": list(agg_meds),
        "emergency": emergency_flag,
        "emergency_reasons": emergency_reasons,
    })


# -------------------------------------------------------------------
# SYMPTOM LIST
# -------------------------------------------------------------------
@api_view(["GET"])
@permission_classes([AllowAny])
def symptom_list(request):

    cols = None

    if os.path.exists(COLS_PATH):
        try:
            cols = joblib_load(COLS_PATH)
        except:
            cols = None

    if cols is None and os.path.exists(TRAIN_CSV_PATH):
        try:
            df = pd.read_csv(TRAIN_CSV_PATH)
            cols = [c for c in df.columns if c != "prognosis"]
        except:
            cols = None

    if cols is None:
        try:
            qs = SymptomDisease.objects.all()
            keys = set()
            for obj in qs:
                if obj.raw:
                    keys.update(obj.raw.keys())
            if "prognosis" in keys:
                keys.remove("prognosis")
            cols = sorted(keys)
        except:
            cols = []

    return Response([{"id": i+1, "name": c} for i, c in enumerate(cols)])


# -------------------------------------------------------------------
# MODEL SCORES
# -------------------------------------------------------------------
@api_view(["GET"])
@permission_classes([AllowAny])
def model_scores(request):

    if not os.path.exists(LAST_SCORES_PATH):
        return JsonResponse({"detail": "Train first."}, status=400)

    data = joblib_load(LAST_SCORES_PATH)
    return JsonResponse(data)


# -------------------------------------------------------------------
# SUBSYMPTOMS
# -------------------------------------------------------------------
@api_view(["GET"])
@permission_classes([AllowAny])
def subsymptoms(request):

    if not os.path.exists(SUBSYM_PATH):
        return JsonResponse({"detail": "subsymptoms.json missing"}, status=404)

    with open(SUBSYM_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    return JsonResponse(data, safe=False)
