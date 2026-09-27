# خضرة — إدارة محلك ببساطة

تطبيق **Desktop** (Electron + React + TypeScript) لإدارة محل خضروات/فواكه.

يعمل **بدون إنترنت**، واجهة عربية **RTL**، والصفحة الرئيسية Navigation Center (بدون Sidebar).

![خضرة](public/icons/icon.png)

## المميزات

| القسم | الوظيفة |
|------|---------|
| 🛒 البيع (POS) | بحث سريع، وزن كسري، اختيار زبون، دفع جزئي، طباعة وصل |
| 👥 الزبائن | بيانات بسيطة، أرصدة، تسديد جزئي، سجل عمليات |
| 🥬 المنتجات | أسعار شراء/بيع، مخزون، حد أدنى، وحدات (كغ/حبة/صندوق) |
| 📦 المشتريات | زيادة مخزون تلقائية مع Transaction |
| 🗑️ الهالك | تالف/فاسد/نقل — خصم مخزون |
| 💰 المصاريف | تصنيفات بسيطة |
| 📊 التقارير | يوم / أسبوع / شهر + منتجات |
| 🔐 إغلاق اليوم | ملخص نقدي وبطاقة |
| ⚙️ الإعدادات | بيانات المحل، كلمة المرور، Backup/Restore |

## التقنيات

- **Electron** · **React 19** · **TypeScript** · **Vite** · **Tailwind CSS 4**
- **MySQL** عند التوفر · **SQLite (sql.js)** كمحرك offline افتراضي
- **mysql2** · Transactions لكل عملية حرجة
- خط **Cairo** · هوية خضراء (شعار خضرة)

## التشغيل السريع

```bash
npm install --ignore-scripts --prefer-offline
KHODRA_DB=sqlite npm run dev
```

- الواجهة: `http://localhost:5173`
- API: `http://localhost:8787`

### حسابات تجريبية

| المستخدم | كلمة المرور | الدور |
|---------|-------------|------|
| `admin` | `admin123` | مدير |
| `cashier` | `cashier123` | صندوق |

العملة: **دج**

## أوامر مفيدة

```bash
npm run dev            # واجهة + API (SQLite)
npm run test:logic     # اختبار منطق الأعمال
npm run build          # بناء الويب
npm run build:electron # بناء تطبيق سطح المكتب
```

## هيكل المشروع

```
electron/          # Main process + services + DB
src/               # React UI (RTL)
public/brand/      # شعار وأيقونات خضرة
scripts/           # dev-server + smoke tests
```

## الترخيص

استخدام خاص / تجاري حسب احتياج المشروع.
