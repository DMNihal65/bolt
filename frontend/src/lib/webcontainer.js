import { WebContainer } from '@webcontainer/api';

class WebContainerService {
    constructor() {
        this.instance = null;
    }

    async boot() {
        if (!this.instance) {
            this.instance = await WebContainer.boot();
        }
        return this.instance;
    }

    getInstance() {
        return this.instance;
    }

    async mount(files) {
        if (!this.instance) throw new Error('WebContainer not booted');
        await this.instance.mount(files);
    }

    /**
     * Create a directory (recursive by default)
     */
    async mkdir(path) {
        if (!this.instance) throw new Error('WebContainer not booted');
        try {
            await this.instance.fs.mkdir(path, { recursive: true });
        } catch (err) {
            // Directory might already exist
            if (!err.message?.includes('EEXIST')) {
                throw err;
            }
        }
    }

    /**
     * Ensure all parent directories exist before writing a file
     */
    async ensureDir(filePath) {
        const parts = filePath.split('/');
        if (parts.length > 1) {
            const dirPath = parts.slice(0, -1).join('/');
            await this.mkdir(dirPath);
        }
    }

    /**
     * Write a file, creating parent directories if needed
     */
    async writeFile(path, content) {
        if (!this.instance) throw new Error('WebContainer not booted');
        // Ensure parent directories exist
        await this.ensureDir(path);
        await this.instance.fs.writeFile(path, content);
    }

    async readFile(path) {
        if (!this.instance) throw new Error('WebContainer not booted');
        return await this.instance.fs.readFile(path, 'utf-8');
    }

    /**
     * Read directory contents
     */
    async readDir(path) {
        if (!this.instance) throw new Error('WebContainer not booted');
        return await this.instance.fs.readdir(path);
    }

    /**
     * Check if a file or directory exists
     */
    async exists(path) {
        if (!this.instance) throw new Error('WebContainer not booted');
        try {
            await this.instance.fs.readFile(path, 'utf-8');
            return true;
        } catch (err) {
            try {
                await this.instance.fs.readdir(path);
                return true;
            } catch {
                return false;
            }
        }
    }

    /**
     * Remove a file or directory
     */
    async remove(path) {
        if (!this.instance) throw new Error('WebContainer not booted');
        try {
            await this.instance.fs.rm(path, { recursive: true });
        } catch (err) {
            // File/dir might not exist
            console.warn('Failed to remove:', path, err);
        }
    }

    /**
     * Spawn a command and return the process
     */
    async spawn(command, args = []) {
        if (!this.instance) throw new Error('WebContainer not booted');
        return await this.instance.spawn(command, args);
    }

    /**
     * Run a command and wait for it to complete
     * Returns { exitCode, output }
     */
    async runCommand(command, args = [], onOutput = null) {
        const process = await this.spawn(command, args);
        let output = '';

        process.output.pipeTo(new WritableStream({
            write(chunk) {
                output += chunk;
                if (onOutput) onOutput(chunk);
            }
        }));

        const exitCode = await process.exit;
        return { exitCode, output };
    }
}

export const webContainer = new WebContainerService();
