<?php
// debug_email_check.php
require 'config.php';
$db = getDB();

echo "<h1>User Emails</h1>";
$users = $db->query("SELECT id, username, email FROM users")->fetchAll(PDO::FETCH_ASSOC);
echo "<pre>" . print_r($users, true) . "</pre>";

echo "<h1>Password Resets</h1>";
$resets = $db->query("SELECT * FROM password_resets")->fetchAll(PDO::FETCH_ASSOC);
echo "<pre>" . print_r($resets, true) . "</pre>";
?>