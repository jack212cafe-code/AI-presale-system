# คู่มือการใช้งาน AI Presale System

## วิธีใช้งาน (สำหรับทีม)

---

## 1. วิธีเข้าใช้งาน

เปิด Chrome หรือ Edge แล้วไปที่:

```
http://<office-server-ip>:3000
```

ตัวอย่าง: `http://192.168.1.100:3000`

---

## 2. วิธีเข้าสู่ระบบ

1. ไปที่หน้า Login ที่ `http://<office-server-ip>:3000`
2. ใส่ **Username** และ **Password** ที่ได้รับจาก admin
3. กดปุ่ม **Login**
4. หลัง login สำเร็จ ระบบจะพาไปที่หน้า Chat

---

## 3. วิธีเขียน Brief

พิมพ์ความต้องการของลูกค้าในช่องข้อความ แล้วกด **Enter** หรือกดปุ่ม **ส่ง**

**ตัวอย่างข้อความ:**

```
ต้องการระบบ HCI สำหรับ 200 users พร้อม backup และ DR
งบประมาณ 5-8 ล้านบาท ต้องการ 50 VMs พื้นที่ 30TB
```

**Tips การเขียน Brief ที่ดี:**
- ระบุจำนวน users และ VMs
- ระบุพื้นที่ storage ที่ต้องการ (TB)
- ระบุประเภทระบบ: HCI, Backup, DR, Cybersecurity
- ระบุงบประมาณ (ถ้ามี)
- ระบุ timeline หรือกรอบเวลา (ถ้ามี)

---

## 4. วิธีอ่านผลลัพธ์

1. ระบบจะประมวลผลและแสดง **Solution Options** ให้เลือก 2-3 ตัวเลือก
2. อ่านรายละเอียดแต่ละ option
3. พิมพ์ **หมายเลข option** ที่ต้องการ (เช่น `1`, `2`, หรือ `3`) แล้วกด Enter
4. ระบบจะสร้าง BOM (Bill of Materials) และ Proposal อัตโนมัติ

---

## 5. วิธีดาวน์โหลด Proposal

1. หลังจากเลือก option แล้ว รอระบบสร้าง Proposal (ใช้เวลา 30-60 วินาที)
2. เมื่อสร้างเสร็จ จะมีปุ่ม **"ดาวน์โหลด Proposal"** ปรากฏในหน้าจอ
3. กดปุ่มเพื่อดาวน์โหลดไฟล์ `.docx`
4. เปิดไฟล์ด้วย Microsoft Word

---

## สำหรับ Admin (การติดตั้งระบบ)

### 6. การติดตั้งบนเครื่อง Office Server

**ความต้องการของระบบ:**
- Node.js เวอร์ชัน 20 ขึ้นไป
- การเชื่อมต่ออินเทอร์เน็ต (สำหรับ OpenAI API และ Supabase)

**ขั้นตอนการติดตั้ง:**

```bash
# ติดตั้ง PM2 (process manager)
npm install -g pm2

# clone โปรเจกต์
git clone <repository-url>
cd ai-presale-system

# ติดตั้ง dependencies
npm install

# ตั้งค่า environment variables
cp .env.example .env
```

แก้ไขไฟล์ `.env` ใส่ค่าทุก key ดังนี้:

```
PORT=3000
PUBLIC_BASE_URL=http://<office-server-ip>:3000

SUPABASE_URL=<url จาก Supabase dashboard>
SUPABASE_ANON_KEY=<anon key จาก Supabase dashboard>
SUPABASE_SERVICE_ROLE_KEY=<service role key จาก Supabase dashboard>

OPENAI_API_KEY=<API key จาก OpenAI>
OPENAI_MODEL_DISCOVERY=gpt-4o-mini
OPENAI_MODEL_SOLUTION=gpt-4o-mini
OPENAI_MODEL_BOM=gpt-4o-mini
OPENAI_MODEL_PROPOSAL=gpt-4o-mini

EMBEDDING_PROVIDER=openai
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

ADMIN_PORTAL_PASSWORD=<รหัสผ่านสำหรับหน้า Admin>
```

```bash
# สร้าง user accounts สำหรับทีม
node scripts/seed-users.js

# เริ่มต้นระบบด้วย PM2
pm2 start ecosystem.config.cjs

# ตั้งค่าให้ระบบ start อัตโนมัติเมื่อ reboot
pm2 save
pm2 startup
# (รัน command ที่ PM2 แสดงให้ด้วยสิทธิ์ Administrator)
```

### 7. การตรวจสอบ Performance

ก่อนรัน perf-check ตรวจสอบว่า `OPENAI_API_KEY` ถูกตั้งค่าใน `.env` แล้ว:

```bash
node scripts/perf-check.js
```

ระบบจะวัดเวลาและแสดงผล PASS/FAIL สำหรับ:
- **Pipeline (turn 1):** เกณฑ์ 60 วินาที
- **Selection (turn 2):** เกณฑ์ 10 วินาที

### การตรวจสอบสถานะระบบ

```bash
# ดูสถานะ process
pm2 status

# ดู logs
pm2 logs ai-presale

# รีสตาร์ทระบบ
pm2 restart ai-presale
```
