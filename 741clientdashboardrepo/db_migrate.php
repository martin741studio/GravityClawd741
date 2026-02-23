<?php
// db_migrate.php
error_reporting(E_ALL);
ini_set('display_errors', 1);

require 'config.php';
$db = getDB();

echo "<h1>Database Migration</h1>";

try {
    // 1. Add email column to users
    try {
        $db->exec("ALTER TABLE users ADD COLUMN email TEXT");
        echo "✅ Added 'email' column to users.<br>";
    } catch (PDOException $e) {
        echo "ℹ️ Column 'email' already exists or error: " . $e->getMessage() . "<br>";
    }

    // 2. Create password_resets table
    $db->exec("CREATE TABLE IF NOT EXISTS password_resets (
        email TEXT NOT NULL,
        token TEXT NOT NULL,
        expires_at DATETIME NOT NULL
    )");
    echo "✅ Created 'password_resets' table.<br>";

    // 3. Update Admin Email
    $stmt = $db->prepare("UPDATE users SET email = ? WHERE username = 'admin'");
    $stmt->execute(['741studio18@googlemail.com']);
    echo "✅ Updated admin email to 741studio18@googlemail.com.<br>";

    echo "<h3 style='color:green'>Migration Complete Successfuly.</h3>";

} catch (Exception $e) {
    echo "<h3 style='color:red'>Migration Error: " . $e->getMessage() . "</h3>";
}
?>