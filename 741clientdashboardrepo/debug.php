<?php
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

echo "Starting debug...<br>";

try {
    echo "Including config.php...<br>";
    require_once 'config.php';
    echo "Config included successfully.<br>";
} catch (Throwable $e) {
    echo "Error in config.php: " . $e->getMessage() . "<br>";
    echo "Trace: <pre>" . $e->getTraceAsString() . "</pre>";
}

echo "Checking DB connection...<br>";
try {
    $db = getDB();
    echo "DB Connected.<br>";
} catch (Throwable $e) {
    echo "DB Error: " . $e->getMessage() . "<br>";
}

echo "Testing CSRF...<br>";
try {
    echo "CSRF Token: " . $_SESSION['csrf_token'] . "<br>";
    echo "CSRF Field: " . htmlspecialchars(csrf_field()) . "<br>";
} catch (Throwable $e) {
    echo "CSRF Error: " . $e->getMessage() . "<br>";
}

echo "Debug complete.";
?>