import pandas as pd
import sqlalchemy as db
from sqlalchemy import text


def get_data(acc, tb_name, db_name):
    if tb_name == "trades":
        table_name = acc
    else:
        table_name = f"{acc.lower()}_{tb_name}"
    try:
        conn = db.create_engine(
            f"mysql+mysqlconnector://247team:password@192.168.50.238:3306/{db_name}"
        )
        query = f"SELECT * FROM {table_name};"
        frame = pd.read_sql_query(text(query), conn.connect())
        # frame = frame[['datetime', 'open', 'high', 'low', 'close', 'volume']]
        # frame.columns = ['Time', 'Open', 'High', 'Low', 'Close', 'Volume']
        # frame['Time'] = pd.to_datetime(frame['Time'])
        # frame = frame.set_index('Time')
        # frame = frame.astype(float)
        return frame
    except Exception as error:
        print(error)
        raise Exception("Data is not available.")
