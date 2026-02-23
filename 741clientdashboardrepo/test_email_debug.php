<?php
ini_set('display_errors', 1);
error_reporting(E_ALL);

echo "Starting Email Test (Retry with Opcache Clear)...<br>";

// 0. Build Info
echo "Script Time: " . date('H:i:s') . "<br>";

// 1. Clear Opcache
if (function_exists('opcache_invalidate')) {
    opcache_invalidate(__DIR__ . '/mail_config.php', true);
    opcache_invalidate(__DIR__ . '/includes/Mailer.php', true);
    echo "Opcache Invalidated.<br>";
} else {
    echo "Opcache functions not available.<br>";
}

// 2. Check Config Content directly
echo "Checking config file content:<br><pre>";
echo htmlspecialchars(file_get_contents('mail_config.php'));
echo "</pre>";

$config = require 'mail_config.php';
echo "Config Loaded. Username: " . $config['username'] . "<br>";

// 3. Require Mailer
require_once 'includes/Mailer.php';

try {
    $mailer = new Mailer();

    // Use Reflection to set debug = true
    $ref = new ReflectionClass($mailer);
    $prop = $ref->getProperty('debug');
    $prop->setAccessible(true);
    $prop->setValue($mailer, true);

    echo "Attempting to send...<br>";
    echo "<pre>";
    $success = $mailer->send($config['username'], '[DEBUG] 741 Portal Test', 'Test message from @gmail.com configuration.');
    echo "</pre>";

    if ($success) {
        echo "<h3 style='color:green'>Email Sent Successfully!</h3>";
    } else {
        echo "<h3 style='color:red'>Email Failed!</h3>";
    }

} catch (Throwable $e) {
    echo "<h3 style='color:red'>Exception Occurred:</h3>";
    echo $e->getMessage();
}
?>