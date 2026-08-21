# SUTEK İş Takip v0.3

Telefon ve bilgisayarda çalışan SUTEK ofis/servis iş takip sistemi.

## Bu sürümde
- SUTEK logo ve marka görünümü
- Gerçek Supabase bağlantısı hazır
- Personel girişi
- Yönetici / Ofis / Servis rolleri
- Günlük işler, bekleyen, tamamlanan ve ertelenen işler
- İş ekleyen kullanıcının otomatik kaydı
- Müşteri adı, telefon, tarih-saat, yapılacak iş
- Servis için İşleme Al / Tamamlandı / Ertele
- Ofis → Servis ve Servis → işi ekleyen kullanıcı bildirim altyapısı
- Müşteri/telefon/iş araması
- Telefon numarasına göre müşteri geçmişi

## Çalıştırma
Node.js 20+ kurulu bilgisayarda proje klasöründe:

npm install
npm run dev

Sonra http://localhost:3000 adresini açın.

`.env.local` dosyasında SUTEK İş Takip Supabase projesinin publishable bağlantı bilgileri hazırdır. Service role / secret anahtar içermez.
SUTEK İş Takip Sistemi
