import { useCallback, useEffect, useState } from 'react'
import { Button, Input, PageHeader, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../lib/toast'

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
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [busyBackup, setBusyBackup] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await api.getSettings()
    if (res.ok && res.data) {
      setShopName(res.data.shop_name || 'خضرة')
      setShopTagline(res.data.shop_tagline || 'إدارة محلك ببساطة')
      setShopPhone(res.data.shop_phone || '')
      setShopAddress(res.data.shop_address || '')
      setReceiptFooter(res.data.receipt_footer || '')
    }
    setLoading(false)
  }, [])

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
              <img src="/icons/icon.png" alt="" width={56} height={56} />
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
