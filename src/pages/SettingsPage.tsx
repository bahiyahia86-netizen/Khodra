import { useCallback, useEffect, useState } from 'react'
import { Button, Input, PageHeader, Select, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../lib/toast'
import type { PrinterOption } from '../types'

export function SettingsPage({ onBack }: { onBack: () => void }) {
  const toast = useToast()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [shopName, setShopName] = useState('')
  const [shopTagline, setShopTagline] = useState('')
  const [shopPhone, setShopPhone] = useState('')
  const [shopAddress, setShopAddress] = useState('')
  const [receiptFooter, setReceiptFooter] = useState('')
  const [saving, setSaving] = useState(false)
  const [printers, setPrinters] = useState<PrinterOption[]>([])
  const [printerName, setPrinterName] = useState('')
  const [printersLoading, setPrintersLoading] = useState(false)
  const [savingPrinter, setSavingPrinter] = useState(false)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [busyBackup, setBusyBackup] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setPrintersLoading(true)
    try {
      const [settingsRes, printersRes] = await Promise.all([
        api.getSettings(),
        api.listPrinters(),
      ])
      if (settingsRes.ok && settingsRes.data) {
        setShopName(settingsRes.data.shop_name || 'خضرة')
        setShopTagline(settingsRes.data.shop_tagline || 'إدارة محلك ببساطة')
        setShopPhone(settingsRes.data.shop_phone || '')
        setShopAddress(settingsRes.data.shop_address || '')
        setReceiptFooter(settingsRes.data.receipt_footer || '')
        setPrinterName(settingsRes.data.printer_name || '')
      } else {
        toast.error(settingsRes.error || 'تعذر تحميل الإعدادات')
      }
      if (printersRes.ok && printersRes.data) {
        setPrinters(printersRes.data)
      } else {
        toast.error(printersRes.error || 'تعذر تحميل قائمة الطابعات')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تحميل الإعدادات والطابعات')
    } finally {
      setLoading(false)
      setPrintersLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  async function saveShop() {
    setSaving(true)
    const res = await api.updateSettings({
      shop_name: shopName,
      shop_tagline: shopTagline,
      shop_phone: shopPhone,
      shop_address: shopAddress,
      receipt_footer: receiptFooter,
    })
    setSaving(false)
    if (!res.ok) toast.error(res.error || 'فشل الحفظ')
    else toast.success('تم حفظ الإعدادات')
  }

  async function savePrinter() {
    setSavingPrinter(true)
    const res = await api.updateSettings({ printer_name: printerName })
    setSavingPrinter(false)
    if (!res.ok) toast.error(res.error || 'تعذر حفظ الطابعة')
    else toast.success('تم حفظ الطابعة')
  }

  async function refreshPrinters() {
    setPrintersLoading(true)
    try {
      const res = await api.listPrinters()
      if (!res.ok || !res.data) {
        toast.error(res.error || 'تعذر تحديث قائمة الطابعات')
        return
      }
      setPrinters(res.data)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر تحديث قائمة الطابعات')
    } finally {
      setPrintersLoading(false)
    }
  }

  async function changePassword() {
    if (!oldPassword || !newPassword) {
      toast.error('أدخل كلمتي المرور')
      return
    }
    const res = await api.changePassword(oldPassword, newPassword)
    if (!res.ok) toast.error(res.error || 'فشل التغيير')
    else {
      toast.success('تم تغيير كلمة المرور')
      setOldPassword('')
      setNewPassword('')
    }
  }

  async function doBackup() {
    setBusyBackup(true)
    const res = await api.createBackup()
    setBusyBackup(false)
    if (!res.ok) toast.error(res.error || 'فشل النسخ')
    else toast.success(`تم الحفظ: ${res.data?.path || ''}`)
  }

  async function doRestore() {
    setBusyBackup(true)
    const res = await api.restoreBackup()
    setBusyBackup(false)
    if (!res.ok) {
      if (res.error !== 'تم الإلغاء') toast.error(res.error || 'فشل الاسترجاع')
      return
    }
    toast.success('تم استرجاع النسخة — أعد تشغيل البرنامج إن لزم')
    await load()
  }

  if (loading) return <Spinner />

  return (
    <div>
      <PageHeader title="الإعدادات" subtitle="بيانات المحل · الأمان · النسخ الاحتياطي" onBack={onBack} />

      <div className="form-grid">
        <div className="section-card">
          <h3>بيانات المحل</h3>
          <div className="stack-gap">
            <div className="settings-brand-preview">
              <img
                src={`${import.meta.env.BASE_URL}icons/ChatGPT%20Image%20Oct%206,%202026,%2009_59_38%20AM.png`}
                alt=""
                width={56}
                height={56}
              />
              <div>
                <div className="strong">{shopName || 'خضرة'}</div>
                <div className="muted">{shopTagline || 'إدارة محلك ببساطة'}</div>
              </div>
            </div>
            <Input label="اسم المحل" value={shopName} onChange={(e) => setShopName(e.target.value)} />
            <Input
              label="الشعار الفرعي"
              value={shopTagline}
              onChange={(e) => setShopTagline(e.target.value)}
              placeholder="إدارة محلك ببساطة"
            />
            <Input label="الهاتف" value={shopPhone} onChange={(e) => setShopPhone(e.target.value)} />
            <Input label="العنوان" value={shopAddress} onChange={(e) => setShopAddress(e.target.value)} />
            <Input label="تذييل الوصل" value={receiptFooter} onChange={(e) => setReceiptFooter(e.target.value)} />
            <div className="form-actions">
              <Button variant="primary" disabled={saving} onClick={() => void saveShop()}>
                {saving ? 'جاري الحفظ...' : 'حفظ'}
              </Button>
            </div>
          </div>
        </div>

        <div className="section-card">
          <h3>الطابعة</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            تُستخدم الطابعة المحددة لطباعة الإيصالات والفواتير مباشرة دون نافذة طباعة.
          </p>
          <div className="stack-gap">
            <Select
              label="اختيار الطابعة"
              value={printerName}
              onChange={(event) => setPrinterName(event.target.value)}
              disabled={printersLoading}
            >
              <option value="">الطابعة الافتراضية في Windows</option>
              {printerName && !printers.some((printer) => printer.name === printerName) && (
                <option value={printerName}>{printerName} (غير متصلة)</option>
              )}
              {printers.map((printer) => (
                <option key={printer.name} value={printer.name}>
                  {printer.displayName || printer.name}
                </option>
              ))}
            </Select>
            <div className="form-actions">
              <Button variant="secondary" disabled={printersLoading} onClick={() => void refreshPrinters()}>
                {printersLoading ? 'جاري البحث...' : 'تحديث الطابعات'}
              </Button>
              <Button variant="primary" disabled={savingPrinter || printersLoading} onClick={() => void savePrinter()}>
                {savingPrinter ? 'جاري الحفظ...' : 'حفظ الطابعة'}
              </Button>
            </div>
            {!printersLoading && printers.length === 0 && (
              <span className="muted">لم يتم العثور على طابعات. تحقق من توصيلها ثم حدّث القائمة.</span>
            )}
          </div>
        </div>

        <div className="section-card">
          <h3>تغيير كلمة المرور</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            المستخدم الحالي: <strong>{user?.fullName}</strong> ({user?.username})
          </p>
          <div className="stack-gap">
            <Input
              label="كلمة المرور الحالية"
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
            />
            <Input
              label="كلمة المرور الجديدة"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <div className="form-actions">
              <Button variant="secondary" onClick={() => void changePassword()}>
                تغيير
              </Button>
            </div>
          </div>
        </div>

        <div className="section-card">
          <h3>النسخ الاحتياطي</h3>
          <p className="muted">
            احفظ نسخة SQL من قاعدة البيانات المحلية، أو استرجع نسخة سابقة. الاسترجاع يستبدل جميع البيانات الحالية.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
            <Button variant="primary" disabled={busyBackup} onClick={() => void doBackup()}>
              {busyBackup ? '...' : 'إنشاء نسخة احتياطية'}
            </Button>
            <Button variant="danger" disabled={busyBackup} onClick={() => void doRestore()}>
              استرجاع نسخة
            </Button>
          </div>
        </div>

        <div className="section-card">
          <h3>اختصارات لوحة المفاتيح</h3>
          <div className="stack-gap">
            <div><span className="kbd">F1</span> البيع</div>
            <div><span className="kbd">F2</span> البحث</div>
            <div><span className="kbd">F3</span> المنتجات</div>
            <div><span className="kbd">F4</span> المشتريات</div>
            <div><span className="kbd">F5</span> تحديث</div>
            <div><span className="kbd">Esc</span> إغلاق</div>
            <div><span className="kbd">Ctrl + Enter</span> إتمام البيع</div>
          </div>
        </div>
      </div>
    </div>
  )
}
