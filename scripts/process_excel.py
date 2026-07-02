import pandas as pd
import json
import os
from datetime import datetime, timedelta
import numpy as np

def calculate_trend(group, col):
    if len(group) < 2:
        return 0
    # Simple linear regression slope
    y = group[col].values
    x = np.arange(len(y))
    slope = np.polyfit(x, y, 1)[0]
    return float(slope)

def process_data():
    # Load Ready Stock
    stock_df = pd.read_excel('Ready Stock Detail.xlsx', skiprows=0)
    stock_df.columns = ['VOUCHER NO', 'STOCK TYPE', 'ITEM', 'COLOR', 'ITEM GRADE', 'PCS', 'CUT', 'QTY', 'RATE', 'AMOUNT', 'SELECT SOURCE', 'BRAND', 'CATALOG', 'ITEM GROUP', 'ITEM SERIES']
    stock_df = stock_df.iloc[1:].copy()

    # Load Challan (Sales)
    sales_df = pd.read_excel('SALES CHALLAN DETAILS REPORT.xlsx', skiprows=0)
    # Finding header row for Sales
    sales_df.columns = sales_df.iloc[0].tolist()
    sales_df = sales_df.iloc[1:].copy()
    sales_df['DATE'] = pd.to_datetime(sales_df['DATE'], errors='coerce')
    sales_df['PCS'] = pd.to_numeric(sales_df['PCS'], errors='coerce').fillna(0)
    sales_df['NET AMT'] = pd.to_numeric(sales_df['NET AMT'], errors='coerce').fillna(0)
    sales_df = sales_df.dropna(subset=['DATE'])

    # Load Orders
    order_df = pd.read_excel('Sales Order Detail.xlsx', skiprows=0)
    order_df.columns = order_df.iloc[0].tolist()
    order_df = order_df.iloc[1:].copy()
    order_df['DATE'] = pd.to_datetime(order_df['DATE'], errors='coerce')
    order_df = order_df.dropna(subset=['DATE'])

    # Load Receive Details
    receive_df = pd.read_excel('Clubing Receive Detail.xlsx', skiprows=0)
    receive_df.columns = ['Issue No', 'RECEIVE DATE', 'RECEIVE NO', 'CHAL NO', 'Planning No', 'JOBBER', 'CATALOG', 'PROD CODE', 'ITEM NAME', 'PCS', 'RATE', 'AMOUNT', 'BAL PCS', 'Months']
    receive_df = receive_df.iloc[1:].copy()
    receive_df['RECEIVE DATE'] = pd.to_datetime(receive_df['RECEIVE DATE'], errors='coerce')

    # Reference Date (Max from files)
    ref_date = sales_df['DATE'].max()
    if pd.isnull(ref_date):
        ref_date = datetime(2026, 3, 10)

    # 1. Last Sale Date per Item
    last_sale = sales_df.groupby('ITEM/DESIGN')['DATE'].max().reset_index()
    last_sale.columns = ['ITEM', 'LAST_SALE_DATE']

    # 2. Last Order Date per Item
    last_order = order_df.groupby('PRODUCT')['DATE'].max().reset_index()
    last_order.columns = ['ITEM', 'LAST_ORDER_DATE']

    # 3. Sales Trends (last 15 days available)
    # We group by date and item to get daily volume
    daily_sales = sales_df.groupby(['ITEM/DESIGN', 'DATE']).agg({'PCS': 'sum', 'NET AMT': 'sum'}).reset_index()
    daily_sales = daily_sales.sort_values(['ITEM/DESIGN', 'DATE'])
    
    trends = daily_sales.groupby('ITEM/DESIGN').apply(lambda x: calculate_trend(x, 'PCS')).reset_index()
    trends.columns = ['ITEM', 'SALES_TREND']
    
    rev_trends = daily_sales.groupby('ITEM/DESIGN').apply(lambda x: calculate_trend(x, 'NET AMT')).reset_index()
    rev_trends.columns = ['ITEM', 'REV_TREND']

    # 4. Oldest Receive Date
    oldest_receive = receive_df.groupby('ITEM NAME')['RECEIVE DATE'].min().reset_index()
    oldest_receive.columns = ['ITEM', 'FIRST_RECEIVE_DATE']

    # Merge everything
    merged = stock_df.copy()
    merged = pd.merge(merged, oldest_receive, on='ITEM', how='left')
    merged = pd.merge(merged, last_sale, on='ITEM', how='left')
    merged = pd.merge(merged, last_order, on='ITEM', how='left')
    merged = pd.merge(merged, trends, on='ITEM', how='left').fillna({'SALES_TREND': 0})
    merged = pd.merge(merged, rev_trends, on='ITEM', how='left').fillna({'REV_TREND': 0})

    # Calculations
    merged['AGE_DAYS'] = (ref_date - pd.to_datetime(merged['FIRST_RECEIVE_DATE'])).dt.days.fillna(0).astype(int)
    merged['DAYS_SINCE_SALE'] = (ref_date - pd.to_datetime(merged['LAST_SALE_DATE'])).dt.days.fillna(1000).astype(int)
    merged['DAYS_SINCE_ORDER'] = (ref_date - pd.to_datetime(merged['LAST_ORDER_DATE'])).dt.days.fillna(1000).astype(int)

    # Classification Logic
    # 1. Clearance: 2.5 months (75 days) no sale + positive stock
    merged['IS_CLEARANCE'] = (merged['DAYS_SINCE_SALE'] > 75) & (merged['PCS'] > 0)
    
    # 2. Urgent Clearance: 1.5 months (45 days) no order + positive stock
    merged['IS_URGENT'] = (merged['DAYS_SINCE_ORDER'] > 45) & (merged['PCS'] > 0)
    
    # 3. Best Seller (Gold): Sale increasing in last 30 days (trend > 0) AND stock decreasing (assume true if sales exist)
    merged['IS_BEST_SELLER'] = (merged['SALES_TREND'] > 0)
    
    # 4. Best Selling 3m: Sales > 0 in 3 months AND Rev trend increasing
    merged['IS_BEST_3M'] = (merged['DAYS_SINCE_SALE'] < 90) & (merged['REV_TREND'] > 0)
    
    # 5. Good Signal (Green Blink): Received within last 14 days AND initial trend positive
    merged['IS_GOOD_SIGNAL'] = (merged['AGE_DAYS'] <= 14) & (merged['SALES_TREND'] > 0)

    # Clean up for JSON
    result = []
    merged = merged.reset_index(drop=True)
    for idx, row in merged.iterrows():
        # Categorization override
        status = "Fresh"
        if row['IS_URGENT']: status = "Urgent Clearance"
        elif row['IS_CLEARANCE']: status = "Clearance"
        elif row['IS_BEST_SELLER']: status = "Best Seller"
        
        result.append({
            "uid": f"{row['ITEM']}-{row['COLOR']}-{idx}",
            "id": str(row['ITEM']),
            "name": str(row['ITEM']),
            "color": str(row['COLOR']),
            "pcs": int(row['PCS']) if pd.notnull(row['PCS']) else 0,
            "rate": float(row['RATE']) if pd.notnull(row['RATE']) else 0,
            "ageDays": int(row['AGE_DAYS']),
            "isClearance": bool(row['IS_CLEARANCE']),
            "isUrgent": bool(row['IS_URGENT']),
            "isBestSeller": bool(row['IS_BEST_SELLER']),
            "isBest3M": bool(row['IS_BEST_3M']),
            "isGoodSignal": bool(row['IS_GOOD_SIGNAL']),
            "status": status,
            "category": str(row['ITEM GROUP']) if pd.notnull(row['ITEM GROUP']) else "General"
        })

    os.makedirs('src/services', exist_ok=True)
    with open('src/services/data.json', 'w') as f:
        json.dump(result, f, indent=2)

    print(f"Propcessed {len(result)} items with advanced rules.")

if __name__ == "__main__":
    process_data()
