import requests
import json
import time

def simulate_ingestion_flow():
    base_url = "http://localhost:4000/api"
    test_cases = [
        {"qr": "12155000", "id": "8596", "name": "8596 RED DRESS", "colors": ["RED"], "expected_rate": 1550},
        {"qr": "99223399", "id": "7001", "name": "7001 BLUE TOP", "colors": ["BLUE"], "expected_rate": 2233},
        {"qr": "00100000", "id": "9000", "name": "9000 BLACK PANTS", "colors": ["BLACK"], "expected_rate": 1000},
    ]
    
    print(f"--- Starting Multi-Case Ingestion Simulation ---\n")
    
    for case in test_cases:
        qr_code = case["qr"]
        print(f"Testing QR: {qr_code}")
        
        product_to_save = {
            "uid": qr_code,
            "id": case["id"],
            "name": case["name"],
            "compulsoryData": qr_code,
            "colors": case["colors"],
            "rate": int(qr_code[2:6]), # The Formula
            "color": case["colors"][0],
            "pcs": 10
        }
        
        try:
            response = requests.post(
                f"{base_url}/products/save-product",
                json=product_to_save,
                headers={"Content-Type": "application/json", "Authorization": "Bearer simulation-admin-token"} 
            )
            
            result = response.json()
            actual_rate = result.get("product", {}).get("rate")
            
            if response.status_code == 200 and actual_rate == case["expected_rate"]:
                print(f"✅ SUCCESS: {qr_code} -> Rate: {actual_rate}")
            else:
                print(f"❌ FAILED: {qr_code} -> Status: {response.status_code}, Rate: {actual_rate} (Expected: {case['expected_rate']})")
                if not result.get("success"):
                    print(f"   Reason: {result.get('message')}")
                    
        except Exception as e:
            print(f"❌ ERROR: {str(e)}")
        print("-" * 40)

if __name__ == "__main__":
    simulate_ingestion_flow()
