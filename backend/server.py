from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import logging
import uuid
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr


mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'mova_db')]

JWT_SECRET = os.environ.get('JWT_SECRET', 'mova_secret_jwt_key_2026')
JWT_ALGO = "HS256"

app = FastAPI(title="MOVA API")
api = APIRouter(prefix="/api")


# ---------- Utils ----------
def hash_pw(p: str) -> str:
    return bcrypt.hashpw(p.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_pw(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode("utf-8"), h.encode("utf-8"))
    except Exception:
        return False


def make_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id, "email": email, "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": payload["sub"]})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    user.pop("password_hash", None)
    user.pop("_id", None)
    return user


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user


def set_auth_cookie(response: Response, token: str):
    response.set_cookie(
        key="access_token", value=token, httponly=True,
        secure=True, samesite="none", max_age=7 * 24 * 3600, path="/",
    )


# ---------- Models ----------
class RegisterIn(BaseModel):
    name: str
    email: EmailStr
    password: str
    alt_name: Optional[str] = ""
    alt_phone: Optional[str] = ""


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class SafetyCheckIn(BaseModel):
    alt_name: str
    alt_phone: str


class SOSIn(BaseModel):
    lat: float
    lng: float
    message: Optional[str] = ""


class BugReportIn(BaseModel):
    title: str
    description: str
    category: str = "bug"  # bug | crowding | delay


class LocationIn(BaseModel):
    lat: float
    lng: float


# ---------- Routes ----------
@api.get("/")
async def root():
    return {"message": "MOVA API online", "time": datetime.now(timezone.utc).isoformat()}


@api.post("/auth/register")
async def register(body: RegisterIn, response: Response):
    email = body.email.lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    uid = str(uuid.uuid4())
    user = {
        "id": uid, "name": body.name, "email": email,
        "password_hash": hash_pw(body.password),
        "role": "user",
        "alt_name": body.alt_name or "",
        "alt_phone": body.alt_phone or "",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user)
    token = make_token(uid, email, "user")
    set_auth_cookie(response, token)
    return {
        "id": uid, "name": body.name, "email": email, "role": "user",
        "alt_name": user["alt_name"], "alt_phone": user["alt_phone"],
        "token": token,
    }


@api.post("/auth/login")
async def login(body: LoginIn, response: Response):
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_pw(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = make_token(user["id"], email, user.get("role", "user"))
    set_auth_cookie(response, token)
    return {
        "id": user["id"], "name": user["name"], "email": email,
        "role": user.get("role", "user"),
        "alt_name": user.get("alt_name", ""),
        "alt_phone": user.get("alt_phone", ""),
        "token": token,
    }


@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@api.post("/safety/checkin")
async def update_safety(body: SafetyCheckIn, user: dict = Depends(get_current_user)):
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"alt_name": body.alt_name, "alt_phone": body.alt_phone}},
    )
    return {"ok": True, "alt_name": body.alt_name, "alt_phone": body.alt_phone}


@api.post("/sos")
async def create_sos(body: SOSIn, user: dict = Depends(get_current_user)):
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"], "user_name": user["name"],
        "user_email": user["email"],
        "alt_name": user.get("alt_name", ""),
        "alt_phone": user.get("alt_phone", ""),
        "lat": body.lat, "lng": body.lng,
        "message": body.message or "",
        "status": "active",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.sos_alerts.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/sos/all")
async def list_sos(user: dict = Depends(require_admin)):
    docs = await db.sos_alerts.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return docs


@api.post("/location/update")
async def update_location(body: LocationIn, user: dict = Depends(get_current_user)):
    doc = {
        "user_id": user["id"], "user_name": user["name"],
        "user_email": user["email"],
        "lat": body.lat, "lng": body.lng,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.locations.update_one({"user_id": user["id"]}, {"$set": doc}, upsert=True)
    return {"ok": True}


@api.get("/location/all")
async def list_locations(user: dict = Depends(require_admin)):
    docs = await db.locations.find({}, {"_id": 0}).to_list(500)
    return docs


@api.post("/bugs")
async def create_bug(body: BugReportIn, user: dict = Depends(get_current_user)):
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"], "user_name": user["name"],
        "title": body.title, "description": body.description,
        "category": body.category, "status": "open",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.bug_reports.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.get("/bugs")
async def list_bugs(user: dict = Depends(get_current_user)):
    query = {} if user.get("role") == "admin" else {"user_id": user["id"]}
    docs = await db.bug_reports.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs


# --------- Static demo data: routes/stops for KIIT & Bhubaneswar ---------
DEMO_STOPS = [
    {"id": "s1", "name": "KIIT Square", "lat": 20.3558, "lng": 85.8175, "accessible": True},
    {"id": "s2", "name": "KIIT Lake Gate", "lat": 20.3492, "lng": 85.8213, "accessible": True},
    {"id": "s3", "name": "Campus 15", "lat": 20.3541, "lng": 85.8262, "accessible": False},
    {"id": "s4", "name": "Patia Station", "lat": 20.3448, "lng": 85.8156, "accessible": True},
    {"id": "s5", "name": "Nandankanan Rd", "lat": 20.3766, "lng": 85.8203, "accessible": True},
    {"id": "s6", "name": "Vani Vihar", "lat": 20.2951, "lng": 85.8398, "accessible": True},
    {"id": "s7", "name": "Master Canteen", "lat": 20.2701, "lng": 85.8412, "accessible": False},
    {"id": "s8", "name": "Kalinga Hospital", "lat": 20.3084, "lng": 85.8267, "accessible": True},
]

DEMO_ROUTES = [
    {"id": "r1", "name": "Campus Loop", "stops": ["s1", "s2", "s3", "s5"], "vehicle": "Low-floor Bus", "accessible": True, "eta_min": 6},
    {"id": "r2", "name": "City Express", "stops": ["s1", "s4", "s6", "s7"], "vehicle": "Shared Van", "accessible": False, "eta_min": 12},
    {"id": "r3", "name": "Hospital Route", "stops": ["s2", "s4", "s8"], "vehicle": "Wheelchair Bus", "accessible": True, "eta_min": 9},
    {"id": "r4", "name": "Night Safe Ride", "stops": ["s1", "s2", "s6", "s7"], "vehicle": "Campus Vehicle", "accessible": True, "eta_min": 14},
]

# Nearby police stations (Bhubaneswar / KIIT area)
POLICE_STATIONS = [
    {"name": "Infocity Police Station", "lat": 20.3489, "lng": 85.8151, "phone": "+91-674-2725100"},
    {"name": "Chandrasekharpur PS", "lat": 20.3196, "lng": 85.8154, "phone": "+91-674-2743100"},
    {"name": "Nayapalli PS", "lat": 20.2932, "lng": 85.8194, "phone": "+91-674-2555100"},
]


@api.get("/transit/stops")
async def get_stops():
    return DEMO_STOPS


@api.get("/transit/routes")
async def get_routes():
    return DEMO_ROUTES


@api.get("/safety/police")
async def get_police():
    return POLICE_STATIONS


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origin_regex=".*",
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(api)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("mova")


@app.on_event("startup")
async def on_startup():
    try:
        await db.users.create_index("email", unique=True)
        await db.users.create_index("id", unique=True)
        admin_email = os.environ.get("ADMIN_EMAIL", "admin@mova.app").lower()
        admin_pass = os.environ.get("ADMIN_PASSWORD", "mova@admin123")
        existing = await db.users.find_one({"email": admin_email})
        if existing is None:
            await db.users.insert_one({
                "id": str(uuid.uuid4()),
                "name": "MOVA Admin",
                "email": admin_email,
                "password_hash": hash_pw(admin_pass),
                "role": "admin",
                "alt_name": "", "alt_phone": "",
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            logger.info("Admin seeded: %s", admin_email)
        elif not verify_pw(admin_pass, existing["password_hash"]):
            await db.users.update_one(
                {"email": admin_email},
                {"$set": {"password_hash": hash_pw(admin_pass), "role": "admin"}},
            )
    except Exception as e:
        logger.warning("Database startup initialization skipped/failed: %s", e)


@app.on_event("shutdown")
async def on_shutdown():
    try:
        client.close()
    except Exception:
        pass

