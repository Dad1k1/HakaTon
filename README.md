# Модус Трейд

1. Установите Git и Docker Desktop. Запустите Docker Desktop.
2. Откройте PowerShell и выполните:

```powershell
git clone https://github.com/Dad1k1/HakaTon.git
cd HakaTon
powershell -ExecutionPolicy Bypass -File .\setup.ps1
```

3. Откройте http://localhost:3000.

Аккаунты для входа:

- `ADMIN` / `ADMIN`
- `USER` / `USER`

Обновление:

```powershell
git pull origin main
docker compose up -d --build app
```

Если вход не работает после старой установки:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup.ps1
```

После этого войдите через `admin` / `admin` или `user` / `user`. Для этих аккаунтов также принимается верхний регистр.

По умолчанию сайт доступен только на этом компьютере. Результаты проверки безопасности: [docs/security-review.md](docs/security-review.md).
