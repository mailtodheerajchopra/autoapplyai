# One-off helper: push non-empty vars from .env to the linked Vercel project (production).
$ErrorActionPreference = 'Continue'
$loaded = @{}
Get-Content .env | ForEach-Object {
  if ($_ -match '^\s*([A-Z_]+)=(.*)$') {
    $loaded[$matches[1]] = $matches[2].Trim('"')
  }
}
$keys = @('AUTH_SECRET', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'GEMINI_API_KEY')
foreach ($k in $keys) {
  $v = $loaded[$k]
  if ([string]::IsNullOrWhiteSpace($v)) {
    Write-Output ('SKIP (empty): ' + $k)
    continue
  }
  $v | vercel.cmd env add $k production --force 2>$null | Out-Null
  Write-Output ('added to production: ' + $k)
}
$cfg = Get-Content .vercel 2>$null | Out-String
$env:APP_URL = 'https://autoapplyai.vercel.app'
$env:APP_URL | vercel.cmd env add APP_URL production --force 2>$null | Out-Null
Write-Output 'added to production: APP_URL'
vercel.cmd env ls production 2>$null | Select-String -Pattern 'AUTH_SECRET|SUPABASE_URL|SUPABASE_SECRET_KEY|APP_URL|GEMINI' | ForEach-Object { ($_.ToString() -split '\s+')[0..1] -join ' ' }
