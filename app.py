"""Neural Tidepool, Python edition: an interactive glowing LIF neuron."""

import plotly.graph_objects as go
import streamlit as st

from neuron import simulate_lif
from neuron_animation import make_neuron_animation

st.set_page_config(page_title="Neural Tidepool", page_icon="🌊", layout="wide")

st.markdown(
    """
    <style>
    .block-container {padding-top: 2rem; padding-bottom: 3rem; max-width: 1280px;}
    h1 {letter-spacing: -0.035em; color: #165A79;}
    h2, h3 {color: #1C526C;}
    [data-testid="stMetricValue"] {color: #176F93;}
    [data-testid="stMetric"] {
      background: #FFFFFF; border: 1px solid #D7E7EF;
      border-radius: 16px; padding: 14px 18px;
      box-shadow: 0 3px 14px rgba(33, 89, 118, 0.045);
    }
    [data-testid="stSidebar"] {border-right: 1px solid #D7E7EF;}
    [data-testid="stPlotlyChart"] {
      border: 1px solid #D7E7EF; border-radius: 18px;
      background: #FFFFFF; padding: 8px;
    }
    </style>
    """,
    unsafe_allow_html=True,
)

st.title("🌊 Neural Tidepool")
st.caption("OCEAN LAB  /  MINI NEURON LAB  /  COMPUTATIONAL NEUROSCIENCE")
st.write(
    "Explore how a simplified neuron integrates electrical current and generates spikes. "
    "Change the inputs, then watch the neuron light up! 🫧"
)

with st.sidebar:
    st.header("⚙️ Neuron controls")
    current_na = st.slider("Input current (nA)", 0.0, 5.0, 2.5, step=0.1)
    tau_ms = st.slider("Membrane time constant (ms)", 5.0, 50.0, 20.0, step=1.0)
    threshold_mv = st.slider("Spike threshold (mV)", -60.0, -40.0, -50.0, step=1.0)
    duration_ms = st.slider("Simulation duration (ms)", 100, 500, 200, step=50)
    st.divider()
    playback_speed = st.select_slider(
        "🎞️ Animation speed", options=[0.5, 1.0, 1.5, 2.0], value=1.0,
        format_func=lambda x: f"{x:g}×",
    )
    st.info("Educational simulation only — not a model of a real person's brain activity.")

result = simulate_lif(
    current_na=current_na,
    tau_ms=tau_ms,
    threshold_mv=threshold_mv,
    duration_ms=duration_ms,
)

spike_count = len(result.spike_times_ms)
firing_rate_hz = spike_count / (duration_ms / 1000)

left, mid, right = st.columns(3)
left.metric("Detected spikes", spike_count)
mid.metric("Average spike rate", f"{firing_rate_hz:.1f} Hz")
right.metric("Applied current", f"{current_na:.1f} nA")

# Animated neuron: HTML/CSS/SVG/JS visualization, not a simulated ion-channel model.
visual = make_neuron_animation(result.spike_times_ms, duration_ms, playback_speed)
if hasattr(st, "iframe"):
    st.iframe(visual, height=412, width="stretch", alt="Animation of a glowing neuron synchronized to LIF spike events")
else:
    # Compatibility with existing installations of Streamlit before 1.56.
    import streamlit.components.v1 as components

    components.html(visual, height=412, scrolling=False)

st.subheader("📈 Membrane potential over time")
fig = go.Figure()
fig.add_trace(
    go.Scatter(
        x=result.time_ms, y=result.voltage_mv,
        name="Membrane potential", mode="lines",
        line=dict(color="#198CB5", width=2.8),
        hovertemplate="Time: %{x:.1f} ms<br>Voltage: %{y:.1f} mV<extra></extra>",
    )
)
if spike_count:
    fig.add_trace(
        go.Scatter(
            x=result.spike_times_ms, y=[threshold_mv] * spike_count,
            name="Spike events", mode="markers",
            marker=dict(size=9, color="#F18B6D", line=dict(color="#FFFFFF", width=1)),
            hovertemplate="Spike at %{x:.1f} ms<extra></extra>",
        )
    )
fig.add_hline(
    y=threshold_mv, line_dash="dash", line_color="#D6A857",
    annotation_text="Threshold", annotation_position="top right",
)
fig.update_layout(
    xaxis_title="Time (ms)", yaxis_title="Membrane potential (mV)",
    template="plotly_white", height=430,
    margin=dict(l=22, r=22, t=24, b=80),
    paper_bgcolor="#FFFFFF", plot_bgcolor="#FFFFFF",
    hovermode="x unified", font=dict(color="#244A60"),
    legend=dict(orientation="h", y=-0.32, x=0, xanchor="left"),
)
fig.update_yaxes(range=[-75, -35], gridcolor="#E8F1F6", zeroline=False)
fig.update_xaxes(gridcolor="#E8F1F6", zeroline=False)
st.plotly_chart(fig, width="stretch", theme=None)

if spike_count == 0:
    st.info("🐚 This neuron is quiet. Increase the input current to reach the threshold!")
else:
    st.success(f"⚡ Your neuron fired {spike_count} time(s). Try a different current and compare!")

with st.expander("🔬 What is the LIF model?"):
    st.markdown(
        r"""
        A **Leaky Integrate-and-Fire (LIF)** neuron accumulates input current,
        leaks voltage back toward its resting potential, and registers a
        **spike** when its membrane voltage reaches a threshold.
        After each event, the voltage resets.

        **Equation:** $\tau_m \frac{dV}{dt} = V_{\mathrm{rest}} - V + RI$

        - **Input current:** electrical stimulation.
        - **Time constant:** how quickly voltage responds.
        - **Threshold:** voltage needed to register a spike.

        **Important:** The visualization is a conceptual illustration.
        The timing of each glow corresponds to a simulated spike, but its
        light moving along the axon does **not** represent simulated action
        potential shape or biological conduction velocity.
        """
    )

st.caption("Made with curiosity, Python & a little ocean breeze 🌊 · Neural Tidepool, Python edition (the full lab lives in docs/)")
