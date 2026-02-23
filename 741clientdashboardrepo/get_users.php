<?php
$db = new PDO('sqlite:portal.db');
$stmt = $db->query("SELECT id, username, email FROM users");
while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
    echo "User: " . $row['username'] . " | Email: " . $row['email'] . "\n";
}
?>