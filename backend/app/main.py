from dotenv import load_dotenv
from fastapi import FastAPI

load_dotenv()

app = FastAPI(
    title="price-memo", description="Strict unit-price comparison (feature B)"
)


@app.get("/")
def read_root():
    return {"message": "price-memo API is running.", "feature": "B"}
