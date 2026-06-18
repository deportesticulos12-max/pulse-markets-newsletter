@echo off
title Iniciar Newsletter Financiero
echo ===================================================
echo   Iniciando Servidor Local para el Newsletter
echo ===================================================
echo.

:: Cambiar al directorio del script
cd /d "%~dp0"

:: Verificar si Node.js está disponible
where node >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo [OK] Node.js detectado. Iniciando con npx serve...
    start "" "http://localhost:5000"
    npx -y serve -l 5000 .
    goto end
)

:: Verificar si Python está disponible
where python >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo [OK] Python detectado. Iniciando con python -m http.server...
    start "" "http://localhost:5000"
    python -m http.server 5000
    goto end
)

:: Si no hay ninguno, intentar con powershell (usando Net.HttpListener) o avisar al usuario
echo [ADVERTENCIA] No se detecto Node.js ni Python.
echo Intentando levantar un servidor rapido con PowerShell...
echo.
start "" "http://localhost:5000"
powershell -NoProfile -Command ^
    "$listener = New-Object System.Net.HttpListener; ^
     $listener.Prefixes.Add('http://localhost:5000/'); ^
     $listener.Start(); ^
     Write-Host 'Servidor ejecutandose en http://localhost:5000/ (Presiona Ctrl+C para salir)'; ^
     while ($listener.IsListening) { ^
         $context = $listener.GetContext(); ^
         $request = $context.Request; ^
         $response = $context.Response; ^
         $urlPath = $request.Url.LocalPath; ^
         if ($urlPath -eq '/') { $urlPath = '/index.html' } ^
         $filePath = Join-Path (Get-Location) $urlPath; ^
         if (Test-Path $filePath -PathType Leaf) { ^
             $bytes = [System.IO.File]::ReadAllBytes($filePath); ^
             if ($filePath.EndsWith('.html')) { $response.ContentType = 'text/html; charset=utf-8' } ^
             elseif ($filePath.EndsWith('.js')) { $response.ContentType = 'application/javascript' } ^
             elseif ($filePath.EndsWith('.css')) { $response.ContentType = 'text/css' } ^
             $response.ContentLength64 = $bytes.Length; ^
             $response.OutputStream.Write($bytes, 0, $bytes.Length); ^
         } else { ^
             $response.StatusCode = 404; ^
         } ^
         $response.Close(); ^
     }"

:end
pause
