# PowerShell script to rename Poll-Vault and Doc-Vault to Vault-Logic

$files = Get-ChildItem -Recurse -File -Include *.ts,*.tsx,*.js,*.jsx,*.json,*.md,*.txt,*.html |
    Where-Object { $_.FullName -notmatch '(node_modules|dist|build|\.git|uploads)' }

$count = 0
foreach ($file in $files) {
    try {
        $content = Get-Content $file.FullName -Raw -Encoding UTF8
        if ($null -eq $content) { continue }

        $newContent = $content `
            -creplace 'Poll-Vault','Vault-Logic' `
            -creplace 'PollVault','VaultLogic' `
            -creplace 'poll-vault','vault-logic' `
            -creplace 'poll_vault','vault_logic' `
            -creplace 'POLL_VAULT','VAULT_LOGIC' `
            -creplace 'POLL-VAULT','VAULT-LOGIC' `
            -creplace 'Doc-Vault','Vault-Logic' `
            -creplace 'DocVault','VaultLogic' `
            -creplace 'doc-vault','vault-logic' `
            -creplace 'doc_vault','vault_logic' `
            -creplace 'DOC_VAULT','VAULT_LOGIC' `
            -creplace 'DOC-VAULT','VAULT-LOGIC'

        if ($content -cne $newContent) {
            Set-Content -Path $file.FullName -Value $newContent -NoNewline -Encoding UTF8
            Write-Host "Updated: $($file.FullName)"
            $count++
        }
    } catch {
        Write-Warning "Error processing $($file.FullName): $_"
    }
}

Write-Host "`nTotal files updated: $count"
