import argparse
import sqlite3
import plotly.graph_objects as go


def get_packet_totals(db_file, time_granularity="minute", outgoing_filter=None, sort_by='amount'):
    """
    Fetch packet totals and sizes per time unit (minute or hour) for each packet name.
    Args:
        db_file (str): Path to the SQLite file.
        time_granularity (str): Either 'minute' or 'hour' for the time grouping.
        outgoing_filter (str): Optional filter ('outgoing', 'incoming', or None for all packets).
        sort_by (str): Sort method - 'amount' or 'size'
    Returns:
        dict: A dictionary containing packet totals, sorted as specified.
    """
    with sqlite3.connect(db_file) as conn:
        cursor = conn.cursor()
        time_format = '%Y-%m-%d %H:%M' if time_granularity == "minute" else '%Y-%m-%d %H'
        query = f"""
            SELECT
                batched_packets.packet_name,
                SUM(batched_packets.amount) AS total_amount,
                SUM(batched_packets.size_bytes) / 1e6 AS total_mb,
                strftime('{time_format}', datetime(batched_packets.collected_at / 1000, 'unixepoch')) AS time_period
            FROM batched_packets
            JOIN packet_bound ON batched_packets.packet_name = packet_bound.packet_name
        """
        if outgoing_filter == "outgoing":
            query += " WHERE packet_bound.outgoing = 1 "
        elif outgoing_filter == "incoming":
            query += " WHERE packet_bound.outgoing = 0 "

        query += f" GROUP BY batched_packets.packet_name, time_period"

        if sort_by == 'amount':
            query += " ORDER BY total_amount DESC"
        elif sort_by == 'size':
            query += " ORDER BY total_mb DESC"

        cursor.execute(query)
        rows = cursor.fetchall()

    packet_totals = {}
    for row in rows:
        packet_name = row[0]
        total_amount = row[1]
        total_mb = row[2]
        time_period = row[3]
        if time_period not in packet_totals:
            packet_totals[time_period] = {}
        packet_totals[time_period][packet_name] = {
            'amount': total_amount,
            'mb': total_mb
        }

    return packet_totals


def plot_packet_totals(packet_totals, time_granularity="minute", sort_by='amount'):
    """
    Plot the packet totals for each packet name over time with sorting options.
    Args:
        packet_totals (dict): A dictionary of packet totals.
        time_granularity (str): Either 'minute' or 'hour' for the time granularity of the x-axis.
        sort_by (str): Sort method - 'amount' or 'size'
    """
    packet_names = set()
    for time_data in packet_totals.values():
        packet_names.update(time_data.keys())

    times = sorted(packet_totals.keys())

    trace_data_amount = []
    trace_data_mb = []

    for packet_name in packet_names:
        amount_values = [
            packet_totals[time].get(packet_name, {}).get('amount', 0)
            for time in times
        ]
        amount_trace = go.Bar(
            x=times,
            y=amount_values,
            name=f"{packet_name} (Count)",
            visible=True if sort_by == 'amount' else False,
            hovertemplate=(
                f"<b>Packet Name:</b> {packet_name}<br>"
                "<b>Time:</b> %{x}<br>"
                "<b>Total Packets:</b> %{y:,.0f}<br>"
                "<b>Total MB:</b> " + "%{customdata[0]:,.2f} MB<extra></extra>"
            ),
            customdata=[[packet_totals[time].get(
                packet_name, {}).get('mb', 0)] for time in times],
            marker=dict(line=dict(color='rgba(255,255,255,0.3)'))
        )
        trace_data_amount.append(amount_trace)

        mb_values = [
            packet_totals[time].get(packet_name, {}).get('mb', 0)
            for time in times
        ]
        mb_trace = go.Bar(
            x=times,
            y=mb_values,
            name=f"{packet_name} (MB)",
            visible=True if sort_by == 'size' else False,
            hovertemplate=(
                f"<b>Packet Name:</b> {packet_name}<br>"
                "<b>Time:</b> %{x}<br>"
                "<b>Total MB:</b> %{y:,.2f} MB<br>"
                "<b>Total Packets:</b> %{customdata[0]:,.0f}<extra></extra>"
            ),
            customdata=[[packet_totals[time].get(
                packet_name, {}).get('amount', 0)] for time in times],
            marker=dict(line=dict(color='rgba(255,255,255,0.3)'))
        )
        trace_data_mb.append(mb_trace)

    traces = trace_data_amount + trace_data_mb

    fig = go.Figure(data=traces)

    fig.update_layout(
        updatemenus=[
            dict(
                buttons=list([
                    dict(
                        args=[{"visible": [
                            *[True]*len(trace_data_amount),
                            *[False]*len(trace_data_mb)
                        ]}],
                        label="Sort by Packet Count",
                        method="update"
                    ),
                    dict(
                        args=[{"visible": [
                            *[False]*len(trace_data_amount),
                            *[True]*len(trace_data_mb)
                        ]}],
                        label="Sort by Total MB",
                        method="update"
                    )
                ]),
                direction="down",
                pad={"r": 10, "t": 10},
                showactive=True,
                x=0.5,
                xanchor="right",
                y=1.1,
                yanchor="top"
            )
        ],
        title=f"Packet Totals Sent Per {time_granularity.capitalize()}",
        xaxis_title=f"Time ({time_granularity.capitalize()})",
        yaxis_title="Total Packets / MB Sent",
        barmode="stack",
        xaxis=dict(
            tickmode="array",
            tickvals=times,
            ticktext=times,
            tickformat='%Y-%m-%d %H:%M' if time_granularity == 'minute' else '%Y-%m-%d %H'
        ),
        showlegend=True,
        legend=dict(
            x=1,
            y=1,
            traceorder='normal',
            orientation='v',
            font=dict(size=10),
            bgcolor='rgba(255, 255, 255, 0.7)',
            bordercolor='rgba(255, 255, 255, 0.5)',
            borderwidth=1,
            itemclick="toggleothers",
            itemsizing='constant',
            xanchor='left',
            yanchor='top',
            tracegroupgap=3,
        ),
        plot_bgcolor="white",
        height=1080,
        width=1920
    )

    fig.show()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Packet Analyzer")
    parser.add_argument(
        "--file", type=str, default="packet.sqlite", help="Path to the database file")
    args = parser.parse_args()

    db_file = args.file
    outgoing_filter = input(
        "Enter packet type filter ('all', 'outgoing', 'incoming'): ").strip().lower()
    time_granularity = input(
        "Enter time granularity ('minute' or 'hour'): ").strip().lower()

    if outgoing_filter not in ["all", "outgoing", "incoming"]:
        print("Invalid input. Please enter 'all', 'outgoing', or 'incoming'.")
    elif time_granularity not in ["minute", "hour"]:
        print("Invalid input. Please enter 'minute' or 'hour'.")
    else:
        packet_totals = get_packet_totals(
            db_file,
            time_granularity=time_granularity,
            outgoing_filter=outgoing_filter,
            sort_by='amount'
        )

        plot_packet_totals(
            packet_totals,
            time_granularity=time_granularity,
            sort_by='amount'
        )
