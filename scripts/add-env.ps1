# Add environment variables to Vercel
$envVars = @{
    'NEXT_PUBLIC_SUPABASE_URL' = 'https://ogbwkrjoqmvnogtryifp.supabase.co'
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY' = 'sb_publishable_SpT4BO77ahkR0VXFLbX07w_r784mN0l'
}

foreach ($var in $envVars.GetEnumerator()) {
    Write-Host "Adding $($var.Key)..."
    $var.Value | npx.cmd vercel env add $var.Key production
}

Write-Host "Done!"
