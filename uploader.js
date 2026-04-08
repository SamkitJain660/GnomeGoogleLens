import Soup from 'gi://Soup?version=3.0';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

export class LensUploader {
    constructor() {
        this._session = new Soup.Session();
        this._session.timeout = 15;
        this._session.user_agent = 'Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0';
    }

    async upload(filePath) {
        const file = Gio.File.new_for_path(filePath);
        const contents = await new Promise((resolve, reject) => {
            file.load_contents_async(null, (obj, res) => {
                const [success, bytes] = file.load_contents_finish(res);
                success ? resolve(bytes) : reject(new Error('Read failed'));
            });
        });
        
        // Upload to a temporary image host (uguu.se)
        // This is necessary to avoid Google Lens session / cookie mismatch errors when
        // trying to anonymously upload directly from the extension to Lens.
        const multipart = new Soup.Multipart(Soup.FORM_MIME_TYPE_MULTIPART);
        multipart.append_form_file('files[]', 'screenshot.png', 'image/png', new GLib.Bytes(contents));
        
        const message = Soup.Message.new_from_multipart('https://uguu.se/upload', multipart);
        
        try {
            const bytes = await this._session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null);
            
            if (message.get_status() === Soup.Status.OK) {
                // Parse the response
                const decoder = new TextDecoder('utf-8');
                const responseText = decoder.decode(bytes.toArray());
                const responseJson = JSON.parse(responseText);
                
                if (responseJson && responseJson.success && responseJson.files && responseJson.files.length > 0) {
                    const imageUrl = responseJson.files[0].url;
                    
                    // Open Google Lens with the uploaded public image URL
                    const lensUrl = `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(imageUrl)}`;
                    Gio.AppInfo.launch_default_for_uri(lensUrl, null);
                } else {
                    throw new Error('Unexpected response format from uguu.se');
                }
            } else {
                throw new Error(`Status code ${message.get_status()}`);
            }
        } catch (e) {
            console.error(`Google Lens upload failed: ${e.message}`);
            throw e;
        } finally {
            file.delete_async(GLib.PRIORITY_DEFAULT, null, () => {});
        }
    }
}
