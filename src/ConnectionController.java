public class ConnectionController {
    private final DeviceInfo device = new DeviceInfo("Galaxy F13");
    private final StreamSettings settings = new StreamSettings();
    private final AudioReceiver receiver = new AudioReceiver();
    public void start() { receiver.start(); }
    public void stop() { receiver.stop(); }
    public String getStatus() { return receiver.isRunning() ? "Listening (simulated)" : "Stopped"; }
    public DeviceInfo getDevice() { return device; }
    public StreamSettings getSettings() { return settings; }
}
