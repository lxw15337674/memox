import { useState } from "react";
import { toast } from "../ui/use-toast";

const useImportMemos = () => {
    const [loading, setLoading] = useState(false);
    const [memos, setMemos] = useState(0);
    const [importedMemos, setImportedMemos] = useState(0);

    const importData = () => {
        toast({
            variant: "destructive",
            title: "功能暂不可用",
            description: "导入功能正在维护中",
            duration: 2000
        });
    }

    return {
        loading,
        memos,
        importedMemos,
        importData
    }
}

export default useImportMemos;