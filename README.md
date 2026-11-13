# Модус Трейд

1. Установите Git и Docker Desktop. Запустите Docker Desktop.
2. Откройте PowerShell и выполните:

```powershell
git clone --branch android-offline-demo https://github.com/Dad1k1/HakaTon.git
cd HakaTon
powershell -ExecutionPolicy Bypass -File .\setup.ps1
```

3. Откройте http://localhost:3000.

Аккаунты для входа:

- `ADMIN` / `ADMIN`
- `USER` / `USER`

Обновление:

```powershell
git pull origin android-offline-demo
docker compose up -d --build app
```
