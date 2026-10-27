public class AudioReceiver {
    private boolean running;
    public void start() { running = true; }
    public void stop() { running = false; }
    public boolean isRunning() { return running; }
}
