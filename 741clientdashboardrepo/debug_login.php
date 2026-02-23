<?php
// debug_login.php
error_reporting(E_ALL);
ini_set('display_errors', 1);

require 'config.php';

echo "<h1>Login Debugger</h1>";

$username = 'reload';
$password = 'reload2026';

echo "Attempting login for: <strong>$username</strong><br>";

try {
    $db = getDB();
    $stmt = $db->prepare("SELECT * FROM users WHERE username = ?");
    $stmt->execute([$username]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($user) {
        echo "User found in DB.<br>";
        if (password_verify($password, $user['password_hash'])) {
            echo "Password verify: <span style='color:green'>PASS</span><br>";

            // Simulate Session Set
            $_SESSION['user_id'] = $user['id'];
            $_SESSION['username'] = $user['username'];
            echo "Session set. Current Session ID: " . session_id() . "<br>";
            echo "Session Data: <pre>" . print_r($_SESSION, true) . "</pre>";
        } else {
            echo "Password verify: <span style='color:red'>FAIL</span><br>";
        }
    } else {
        echo "User <span style='color:red'>NOT FOUND</span>.<br>";
    }

} catch (Exception $e) {
    echo "Error: " . $e->getMessage();
}
?>