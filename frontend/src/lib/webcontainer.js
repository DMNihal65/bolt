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

    async mount(files) {
        if (!this.instance) throw new Error('WebContainer not booted');
        await this.instance.mount(files);
    }

    async writeFile(path, content) {
        if (!this.instance) throw new Error('WebContainer not booted');
        await this.instance.fs.writeFile(path, content);
    }

    async readFile(path) {
        if (!this.instance) throw new Error('WebContainer not booted');
        return await this.instance.fs.readFile(path, 'utf-8');
    }

    async spawn(command, args = []) {
        if (!this.instance) throw new Error('WebContainer not booted');
        return await this.instance.spawn(command, args);
    }
}

export const webContainer = new WebContainerService();
