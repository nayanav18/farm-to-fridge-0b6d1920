# server.py
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import os
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("Set SUPABASE_URL and SUPABASE_KEY in environment")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

app = FastAPI(title="Demand Forecast API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # change to your domain(s) in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ForecastResponse(BaseModel):
    dates: List[str]
    actual: List[float]
    predicted: List[float]
    accuracy: float


def load_sales_from_supabase(supermarket: str, product: str):
    """
    Fetch daily sales for given supermarket & product from historical_sales table.
    Expects columns: date, quantity_sold
    """
    query = (
        supabase
        .from_("historical_sales")
        .select("date, quantity_sold")
        .eq("product_name", product)
        .eq("supermarket_branch", supermarket)
        .order("date", {"ascending": True})
    )

    res = query.execute()
    if (res.get("error")):
        raise RuntimeError(f"Supabase error: {res['error']}")
    data = res.get("data") or []
    if len(data) == 0:
        return pd.DataFrame(columns=["Date", "Demand"])

    df = pd.DataFrame(data)
    df["Date"] = pd.to_datetime(df["date"])
    df = df.groupby("Date", as_index=False)["quantity_sold"].sum().rename(columns={"quantity_sold": "Demand"})
    return df[["Date", "Demand"]]


def prepare_features(df: pd.DataFrame):
    """Feature engineering identical to your provided script."""
    df = df.copy()
    df["DayOfWeek"] = df["Date"].dt.dayofweek
    df["Month"] = df["Date"].dt.month
    df["Lag1"] = df["Demand"].shift(1)
    df["Lag7"] = df["Demand"].shift(7)
    df["Lag90"] = df["Demand"].shift(90)
    df["RollMean7"] = df["Demand"].rolling(window=7).mean()
    df["RollMean14"] = df["Demand"].rolling(window=14).mean()
    df["RollStd7"] = df["Demand"].rolling(window=7).std()
    df["EMA7"] = df["Demand"].ewm(span=7, adjust=False).mean()
    df["EMA30"] = df["Demand"].ewm(span=30, adjust=False).mean()
    df["TimeIndex"] = np.arange(len(df))
    df["IsWeekend"] = df["Date"].dt.dayofweek.isin([5, 6]).astype(int)
    df = df.dropna().reset_index(drop=True)
    return df


@app.get("/forecast", response_model=ForecastResponse)
def forecast(supermarket: str = Query(...), product: str = Query(...), days: int = Query(30, ge=7, le=365)):
    """
    GET /forecast?supermarket=Supermarket%20A&product=Milk&days=30
    Returns actual & predicted demand for last `days` days using an improved RandomForest.
    """
    try:
        raw = load_sales_from_supabase(supermarket, product)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if raw.empty or raw["Demand"].sum() == 0:
        # Return empty predictable shape
        return {
            "dates": [],
            "actual": [],
            "predicted": [],
            "accuracy": 0.0,
        }

    # fill missing dates
    full_range = pd.date_range(raw["Date"].min(), raw["Date"].max(), freq="D")
    df = raw.set_index("Date").reindex(full_range).fillna(0)
    df.index.name = "Date"
    df = df.reset_index()

    # prepare features
    df_feat = prepare_features(df)

    if len(df_feat) <= days:
        # not enough history after dropna — lower days
        days = max(7, len(df_feat) // 3)
    train = df_feat[:-days]
    test = df_feat[-days:]

    features = [
        "DayOfWeek", "Month",
        "Lag1", "Lag7", "Lag90",
        "RollMean7", "RollMean14", "RollStd7",
        "EMA7", "EMA30",
        "TimeIndex", "IsWeekend"
    ]

    X_train = train[features]
    y_train = train["Demand"]
    X_test = test[features]
    y_test = test["Demand"]

    model = RandomForestRegressor(
        n_estimators=500,
        max_depth=8,
        min_samples_split=5,
        min_samples_leaf=2,
        max_features="sqrt",
        bootstrap=True,
        random_state=42,
        n_jobs=-1,
    )

    model.fit(X_train, y_train)
    forecast_vals = model.predict(X_test)

    # metrics
    mape = float(np.mean(np.abs((y_test.values - forecast_vals) / (y_test.values + 1e-5))) * 100)
    accuracy = max(0.0, 100.0 - mape)

    # return ISO date strings
    dates = list(test["Date"].dt.strftime("%Y-%m-%d").tolist())
    actual = [float(x) for x in y_test.values.tolist()]
    predicted = [float(x) for x in forecast_vals.tolist()]

    return {
        "dates": dates,
        "actual": actual,
        "predicted": predicted,
        "accuracy": float(round(accuracy, 2)),
    }


# health
@app.get("/health")
def health():
    return {"status": "ok"}
