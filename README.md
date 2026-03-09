# Delivery Company Management System (ERP-Style MVP)

منصة تشغيل داخلية لإدارة شركة مناديب توصيل مع صلاحيات إدارية متعددة، متابعة تشغيل يومي، إدارة مالية، وتحليلات ذكية.

## Tech Stack الحالي في هذا المستودع

- Backend: Node.js HTTP Server (قابل للتحويل إلى Express بسهولة)
- Frontend: HTML/CSS/JS (واجهة RTL متجاوبة)
- Database (Production Design): PostgreSQL schema في `docs/postgres-schema.sql`
- Auth: JWT + Role-Based Access Control

> ملاحظة: المشروع هنا نسخة MVP عملية محلية، مع تصميم قاعدة بيانات إنتاجي كامل يغطي كل الجداول المطلوبة.

## Roles

- `general_manager`: صلاحيات كاملة
- `hr`: إدارة المندوبين/الوثائق/السيارات
- `finance`: إدارة المعاملات المالية والتقارير
- `supervisor`: العمليات اليومية والتطبيقات والحسابات

## Run

```bash
npm start
```

ثم افتح: `http://localhost:3000`

## Demo Accounts

- `admin / admin123`
- `hr / hr123`
- `finance / finance123`
- `supervisor / supervisor123`

## Core APIs

- `POST /api/auth/login`
- `POST/GET /api/drivers`
- `POST/GET /api/driver-documents`
- `POST/GET /api/vehicles`
- `POST/GET /api/applications`
- `POST/GET /api/accounts`
- `POST/GET /api/account-rentals`
- `POST/GET /api/daily-operations`
- `POST/GET /api/finance-transactions`
- `GET /api/wallets`
- `GET /api/dashboard`
- `GET /api/profit-analysis`
- `GET /api/ai-analytics`
- `GET /api/smart-alerts`
- `GET /api/reports?type=driver_performance&format=json|excel|pdf`

## Supported business modules

- إدارة المناديب + الوثائق + المركبات
- إدارة التطبيقات، الحسابات، وتأجير الحسابات
- العمليات اليومية مع حساب `target_progress_percentage` تلقائيًا
- محفظة مالية لكل مندوب + تتبع ربح الشركة
- تقارير (JSON / CSV كـ Excel / PDF simulated)
- تحليلات AI تشغيلية وتنبيهات ذكية
