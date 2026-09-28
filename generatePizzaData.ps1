$hostUrl = "http://localhost:3000"

$response = Invoke-RestMethod -Method Put -Uri "$hostUrl/api/auth" -ContentType "application/json" -Body '{"email":"a@jwt.com", "password":"admin"}'
$token = $response.token

Invoke-RestMethod -Method Post -Uri "$hostUrl/api/auth" -ContentType "application/json" -Body '{"name":"pizza diner", "email":"d@jwt.com", "password":"diner"}'
Invoke-RestMethod -Method Post -Uri "$hostUrl/api/auth" -ContentType "application/json" -Body '{"name":"pizza franchisee", "email":"f@jwt.com", "password":"franchisee"}'

Invoke-RestMethod -Method Put -Uri "$hostUrl/api/order/menu" -ContentType "application/json" -Headers @{Authorization="Bearer $token"} -Body '{ "title":"Veggie", "description": "A garden of delight", "image":"pizza1.png", "price": 0.0038 }'
Invoke-RestMethod -Method Put -Uri "$hostUrl/api/order/menu" -ContentType "application/json" -Headers @{Authorization="Bearer $token"} -Body '{ "title":"Pepperoni", "description": "Spicy treat", "image":"pizza2.png", "price": 0.0042 }'
Invoke-RestMethod -Method Put -Uri "$hostUrl/api/order/menu" -ContentType "application/json" -Headers @{Authorization="Bearer $token"} -Body '{ "title":"Margarita", "description": "Essential classic", "image":"pizza3.png", "price": 0.0042 }'
Invoke-RestMethod -Method Put -Uri "$hostUrl/api/order/menu" -ContentType "application/json" -Headers @{Authorization="Bearer $token"} -Body '{ "title":"Crusty", "description": "A dry mouthed favorite", "image":"pizza4.png", "price": 0.0028 }'
Invoke-RestMethod -Method Put -Uri "$hostUrl/api/order/menu" -ContentType "application/json" -Headers @{Authorization="Bearer $token"} -Body '{ "title":"Charred Leopard", "description": "For those with a darker side", "image":"pizza5.png", "price": 0.0099 }'

Invoke-RestMethod -Method Post -Uri "$hostUrl/api/franchise" -ContentType "application/json" -Headers @{Authorization="Bearer $token"} -Body '{"name": "pizzaPocket", "admins": [{"email": "f@jwt.com"}]}'
Invoke-RestMethod -Method Post -Uri "$hostUrl/api/franchise/1/store" -ContentType "application/json" -Headers @{Authorization="Bearer $token"} -Body '{"franchiseId": 1, "name":"SLC"}'

Write-Host "Database data generated"