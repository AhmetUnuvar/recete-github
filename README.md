# Recete - Mikroservis Stok ve Gelir/Gider Takip

Bu proje Node.js tabanli mikroservis mimarisi + PostgreSQL + Docker + Expo mobil istemci ile calisir.

## Mimari
- `api-gateway`: Mobil istemciden gelen tum isteklerin giris noktasi
- `auth-service`: Giris/JWT token islemleri
- `stock-service`: Stok urunleri CRUD islemleri
- `finance-service`: Gelir/Gider kayitlari
- `postgres`: Tek merkezi veritabani (servis bazli tablolar)
- `mobile-app`: Expo (React Native) istemci

## Hizli Baslangic

### 1) Backend servisleri Docker ile kaldir
```bash
docker compose up --build
```

Gateway: `http://localhost:4000`

### 2) Mobil uygulamayi calistir (ayri terminal)
```bash
cd mobile-app
npm install
npx expo start
```

Acilan QR kodu Expo Go ile telefondan okut.

> Telefon ve bilgisayarin ayni agda olmasi gerekir.

## API Ornekleri

### Register
`POST /auth/register`
```json
{ "email": "test@example.com", "password": "123456" }
```

### Login
`POST /auth/login`
```json
{ "email": "test@example.com", "password": "123456" }
```

### Stok Ekle
`POST /stock/items`
```json
{ "name": "Domates", "quantity": 20, "unit": "kg" }
```

### Gelir/Gider Ekle
`POST /finance/transactions`
```json
{ "type": "expense", "amount": 250, "description": "Tedarik" }
```
