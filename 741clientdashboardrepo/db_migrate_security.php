<?php
// db_migrate_security.php
declare(strict_types=1);

require 'config.php';

echo "Starting Security Migration...\n";

$db = getDB();

// 1. Create Login Attempts Table for Rate Limiting
// storing IP, Attempt Count, Last Attempt Time
$db->exec("CREATE TABLE IF NOT EXISTS login_attempts (
    ip_address TEXT PRIMARY KEY,
    attempts INTEGER DEFAULT 0,
    last_attempt DATETIME,
    locked_until DATETIME
)");

echo "✅ Created 'login_attempts' table.\n";
echo "Security Migration Complete.\n";
?>