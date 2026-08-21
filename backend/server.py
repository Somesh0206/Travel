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

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("mova")

mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=1500)
db = client[os.environ.get('DB_NAME', 'mova_db')]

JWT_SECRET = os.environ.get('JWT_SECRET', 'mova_secret_jwt_key_2026')
JWT_ALGO = "HS256"

app = FastAPI(title="MOVA API")
api = APIRouter(prefix="/api")

# ---------- In-Memory Fallback Storage (when MongoDB is unreachable) ----------
MEM_USERS = {}        # email -> user_dict
MEM_USERS_BY_ID = {}  # id -> user_dict
MEM_SOS = []          # list of sos_dicts
MEM_LOCATIONS = {}    # user_id -> location_dict
MEM_BUGS = []         # list of bug_dicts


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


# Safe DB wrappers with fallback to in-memory store
async def db_find_user_by_email(email: str) -> Optional[dict]:
    try:
        u = await db.users.find_one({"email": email})
        if u:
            return u
    except Exception as e:
        logger.warning("DB user fetch error: %s", e)
    return MEM_USERS.get(email)


async def db_find_user_by_id(uid: str) -> Optional[dict]:
    try:
        u = await db.users.find_one({"id": uid})
        if u:
            return u
    except Exception as e:
        logger.warning("DB user by id fetch error: %s", e)
    return MEM_USERS_BY_ID.get(uid)


async def db_insert_user(user: dict):
    MEM_USERS[user["email"]] = user
    MEM_USERS_BY_ID[user["id"]] = user
    try:
        await db.users.insert_one(user.copy())
    except Exception as e:
        logger.warning("DB user insert skipped: %s", e)


async def db_update_user_safety(uid: str, alt_name: str, alt_phone: str):
    u = MEM_USERS_BY_ID.get(uid)
    if u:
        u["alt_name"] = alt_name
        u["alt_phone"] = alt_phone
    try:
        await db.users.update_one({"id": uid}, {"$set": {"alt_name": alt_name, "alt_phone": alt_phone}})
    except Exception as e:
        logger.warning("DB user update skipped: %s", e)


async def db_insert_sos(doc: dict):
    MEM_SOS.insert(0, doc)
    try:
        await db.sos_alerts.insert_one(doc.copy())
    except Exception as e:
        logger.warning("DB SOS insert skipped: %s", e)


async def db_list_sos() -> List[dict]:
    try:
        docs = await db.sos_alerts.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
        if docs:
            return docs
    except Exception as e:
        logger.warning("DB list SOS skipped: %s", e)
    return [dict(d) for d in MEM_SOS]


async def db_upsert_location(doc: dict):
    MEM_LOCATIONS[doc["user_id"]] = doc
    try:
        await db.locations.update_one({"user_id": doc["user_id"]}, {"$set": doc}, upsert=True)
    except Exception as e:
        logger.warning("DB location upsert skipped: %s", e)


async def db_list_locations() -> List[dict]:
    try:
        docs = await db.locations.find({}, {"_id": 0}).to_list(500)
        if docs:
            return docs
    except Exception as e:
        logger.warning("DB list locations skipped: %s", e)
    return list(MEM_LOCATIONS.values())


async def db_insert_bug(doc: dict):
    MEM_BUGS.insert(0, doc)
    try:
        await db.bug_reports.insert_one(doc.copy())
    except Exception as e:
        logger.warning("DB bug insert skipped: %s", e)


async def db_list_bugs(query: dict) -> List[dict]:
    try:
        docs = await db.bug_reports.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
        if docs:
            return docs
    except Exception as e:
        logger.warning("DB list bugs skipped: %s", e)
    uid = query.get("user_id")
    if uid:
        return [b for b in MEM_BUGS if b.get("user_id") == uid]
    return [dict(b) for b in MEM_BUGS]


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
    user = await db_find_user_by_id(payload["sub"])
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    user_copy = dict(user)
    user_copy.pop("password_hash", None)
    user_copy.pop("_id", None)
    return user_copy


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user


def set_auth_cookie(response: Response, token: str):
    response.set_cookie(
        key="access_token", value=token, httponly=True,
        secure=True, samesite="none", max_age=7 * 24 * 3600, path="/",
    )


# Seed default admin user in memory
admin_email = os.environ.get("ADMIN_EMAIL", "admin@mova.app").lower()
admin_pass = os.environ.get("ADMIN_PASSWORD", "mova@admin123")
admin_uid = "admin-mova-seed-id"
admin_user_doc = {
    "id": admin_uid,
    "name": "MOVA Admin",
    "email": admin_email,
    "password_hash": hash_pw(admin_pass),
    "role": "admin",
    "alt_name": "", "alt_phone": "",
    "created_at": datetime.now(timezone.utc).isoformat(),
}
MEM_USERS[admin_email] = admin_user_doc
MEM_USERS_BY_ID[admin_uid] = admin_user_doc


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
    existing = await db_find_user_by_email(email)
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
    await db_insert_user(user)
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
    user = await db_find_user_by_email(email)
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
    await db_update_user_safety(user["id"], body.alt_name, body.alt_phone)
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
    await db_insert_sos(doc)
    doc_copy = dict(doc)
    doc_copy.pop("_id", None)
    return doc_copy


@api.get("/sos/all")
async def list_sos(user: dict = Depends(require_admin)):
    docs = await db_list_sos()
    return docs


@api.post("/location/update")
async def update_location(body: LocationIn, user: dict = Depends(get_current_user)):
    doc = {
        "user_id": user["id"], "user_name": user["name"],
        "user_email": user["email"],
        "lat": body.lat, "lng": body.lng,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db_upsert_location(doc)
    return {"ok": True}


@api.get("/location/all")
async def list_locations(user: dict = Depends(require_admin)):
    docs = await db_list_locations()
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
    await db_insert_bug(doc)
    doc_copy = dict(doc)
    doc_copy.pop("_id", None)
    return doc_copy


@api.get("/bugs")
async def list_bugs(user: dict = Depends(get_current_user)):
    query = {} if user.get("role") == "admin" else {"user_id": user["id"]}
    docs = await db_list_bugs(query)
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


@app.on_event("startup")
async def on_startup():
    try:
        await db.users.create_index("email", unique=True)
        await db.users.create_index("id", unique=True)
    except Exception as e:
        logger.warning("DB index creation skipped: %s", e)


@app.on_event("shutdown")
async def on_shutdown():
    try:
        client.close()
    except Exception:
        pass