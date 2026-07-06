@echo off
echo ==================================================
echo 🚀 STARTING POSTGRES DATABASE FOR CAR LEASING SaaS
echo ==================================================

:: Check if Docker is running
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker daemon is not running!
    echo Please open Docker Desktop on your computer, wait for it to start, then run this file again.
    echo.
    pause
    exit /b 1
)

echo [INFO] Docker is active. Checking for existing container 'car-leasing-postgres'...
docker ps -a --format "{{.Names}}" | findstr /R "^car-leasing-postgres$" >nul
if %errorlevel% equ 0 (
    echo [INFO] Container 'car-leasing-postgres' already exists. Starting it...
    docker start car-leasing-postgres
) else (
    echo [INFO] Creating and launching a new PostgreSQL container...
    docker run --name car-leasing-postgres -e POSTGRES_PASSWORD=postgres_password -e POSTGRES_DB=car_leasing_db -p 5432:5432 -d postgres:latest
)

echo [INFO] Waiting for database to initialize (5 seconds)...
timeout /t 5 /nobreak >nul

echo.
echo ==================================================
echo 🔄 RUNNING PRISMA SCHEMA DB PUSH
echo ==================================================
call npx prisma db push

if %errorlevel% neq 0 (
    echo [ERROR] Prisma db push failed. Please verify your DATABASE_URL in .env matches the docker setup.
) else (
    echo.
    echo ==================================================
    echo 🎉 SUCCESS: Database is ready and schemas are pushed!
    echo.
    echo You can now start your server in development mode by running:
    echo     npm run dev
    echo ==================================================
)

pause
