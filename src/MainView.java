import javax.swing.*;
import java.awt.*;
public class MainView {
    private final ConnectionController controller = new ConnectionController();
    public void show() {
        JFrame frame = new JFrame("BlueBridge - Interface Prototype");
        frame.setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        frame.setSize(480, 320);
        frame.setLocationRelativeTo(null);
        JPanel panel = new JPanel(new GridLayout(0, 1, 8, 8));
        panel.setBorder(BorderFactory.createEmptyBorder(20, 25, 20, 25));
        JLabel status = new JLabel("Status: " + controller.getStatus());
        JLabel volumeLabel = new JLabel("Volume: 70%");
        panel.add(new JLabel("BlueBridge - Bluetooth Audio Receiver"));
        panel.add(new JLabel("Device: " + controller.getDevice().getName() + " | Sample rate: " + controller.getSettings().getSampleRate() + " Hz"));
        panel.add(status);
        JSlider volume = new JSlider(0, 100, controller.getSettings().getVolume());
        volume.addChangeListener(e -> { controller.getSettings().setVolume(volume.getValue()); volumeLabel.setText("Volume: " + controller.getSettings().getVolume() + "%"); });
        panel.add(volumeLabel); panel.add(volume);
        JPanel buttons = new JPanel();
        JButton start = new JButton("Start Listening");
        JButton stop = new JButton("Stop");
        start.addActionListener(e -> { controller.start(); status.setText("Status: " + controller.getStatus()); });
        stop.addActionListener(e -> { controller.stop(); status.setText("Status: " + controller.getStatus()); });
        buttons.add(start); buttons.add(stop); panel.add(buttons);
        panel.add(new JLabel("Simulation only: Bluetooth and audio are not connected."));
        frame.setContentPane(panel); frame.setVisible(true);
    }
}
